<?php

/**
 * Migrates the tracks saved in the original text formats of the game to its track files, the
 * binary format the backend stores since (see `api.php`), in the database configured by the
 * environment as for the endpoints.
 *
 * Usage, from the root of the deployed site, once the game is built (`dist/convert-tracks.cjs`):
 *
 *     php backend/migrate-tracks.php [--dry-run]
 *
 * - With PostgreSQL, the `CODE` columns of `TRACKS` and `LOCAL_UPLOADS` (the uploads of the sample
 *   website, when it has its tables) become `BYTEA`, keeping their texts as bytes. SQLite stores
 *   the bytes in its columns as they are.
 * - Each track code becomes a track code and each editor file an editor file, converted by the
 *   game with Node (`OPENRIDER_NODE`, `node` by default), which reads each track file back and
 *   compares it to the original track. A track that cannot be converted keeps its text, which
 *   the game and the site still read, and is listed at the end: the script then exits with 1.
 * - The tracks already converted are skipped, so that the script can run again, e.g. after an
 *   interruption or for the tracks uploaded meanwhile.
 * - `--dry-run` converts and checks every track without changing the database.
 *
 * Back the database up first.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/db/api.php';

/** The converter of the game, built by `npm run build`. */
const MIGRATE_CONVERTER = __DIR__ . '/../dist/convert-tracks.cjs';

/**
 * Tracks converted at once: at most this many, and of at most this many bytes but for a single
 * larger track, so that the memory stays bounded.
 */
const MIGRATE_BATCH_ROWS = 100,
    MIGRATE_BATCH_BYTES = 8 * 1024 * 1024;

/** Writes a line to the standard output. */
function migrate_log(string $line): void
{
    fwrite(STDOUT, $line . PHP_EOL);
}

/** Whether a table exists in the database. */
function migrate_has_table(PDO $db, string $table): bool
{
    try {
        $db->query("SELECT 1 FROM \"$table\" WHERE 1 = 0");
        return true;
    } catch (PDOException $error) {
        return false;
    }
}

/** Turns the `CODE` column of a table into `BYTEA` with PostgreSQL, unless already done. */
function migrate_column(PDO $db, string $table): void
{
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'pgsql') {
        return;
    }

    $statement = $db->prepare(
        'SELECT data_type FROM information_schema.columns'
        . ' WHERE table_name = :table AND column_name = \'CODE\''
    );
    $statement->execute(['table' => $table]);
    $type = $statement->fetchColumn();
    if ($type === 'bytea') {
        return;
    }

    migrate_log("$table: CODE column from $type to bytea");
    $db->exec(
        "ALTER TABLE \"$table\" ALTER COLUMN \"CODE\" TYPE BYTEA USING convert_to(\"CODE\", 'UTF8')"
    );
}

/**
 * Converts tracks with the converter of the game.
 *
 * @param array $codes Codes by id.
 * @return array Results by id: `code` with the track file, `binary`, or `error`.
 * @throws RuntimeException When the converter cannot run.
 */
function migrate_convert(array $codes): array
{
    $input = [];
    foreach ($codes as $id => $code) {
        $input[] = ['id' => $id, 'code' => base64_encode($code)];
    }

    $node = getenv('OPENRIDER_NODE') ?: 'node';
    $pipes = [];
    $process = proc_open(
        [$node, MIGRATE_CONVERTER],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    if (!is_resource($process)) {
        throw new RuntimeException("Cannot run the converter with $node");
    }

    $json = json_encode($input);
    // A pipe may take a large input in several writes
    for ($written = 0; $written < strlen($json); $written += $count) {
        $count = fwrite($pipes[0], substr($json, $written, 1 << 16));
        if (!$count) {
            break;
        }
    }
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);

    $results = json_decode((string) $output, true);
    if ($status !== 0 || !is_array($results)) {
        throw new RuntimeException("Converter failed ($status): " . trim((string) $errors));
    }

    $byId = [];
    foreach ($results as $result) {
        $byId[(int) $result['id']] = $result;
    }
    return $byId;
}

/**
 * Converts the tracks of a table, by batches each written in a transaction.
 *
 * @return array Counts of the table: `rows`, `binary` (already converted), `converted`,
 *   `before` and `after` (bytes of the converted tracks), and `failed` (errors by id).
 */
function migrate_table(PDO $db, string $table, bool $dryRun): array
{
    $report = ['rows' => 0, 'binary' => 0, 'converted' => 0, 'before' => 0, 'after' => 0,
        'failed' => []];

    // Ids, sizes and first bytes of every track, without loading the tracks themselves
    $rows = $db->query(
        "SELECT \"ID\", length(\"CODE\") AS \"SIZE\", substr(\"CODE\", 1, 4) AS \"HEAD\""
        . " FROM \"$table\" ORDER BY \"ID\""
    )->fetchAll(PDO::FETCH_ASSOC);
    $report['rows'] = count($rows);

    $batches = [];
    $batch = [];
    $batchBytes = 0;
    foreach ($rows as $row) {
        if (openrider_is_track_file((string) openrider_bytes($row['HEAD']))) {
            $report['binary']++;
            continue;
        }
        $size = (int) $row['SIZE'];
        if ($batch && (count($batch) >= MIGRATE_BATCH_ROWS || $batchBytes + $size > MIGRATE_BATCH_BYTES)) {
            $batches[] = $batch;
            $batch = [];
            $batchBytes = 0;
        }
        $batch[] = (int) $row['ID'];
        $batchBytes += $size;
    }
    if ($batch) {
        $batches[] = $batch;
    }

    $select = $db->prepare("SELECT \"CODE\" FROM \"$table\" WHERE \"ID\" = :id");
    $update = $db->prepare("UPDATE \"$table\" SET \"CODE\" = :code WHERE \"ID\" = :id");
    $done = 0;
    $total = $report['rows'] - $report['binary'];
    foreach ($batches as $ids) {
        $codes = [];
        foreach ($ids as $id) {
            $select->execute(['id' => $id]);
            $codes[$id] = (string) openrider_bytes($select->fetchColumn());
            $select->closeCursor();
        }

        $results = migrate_convert($codes);
        $converted = [];
        foreach ($codes as $id => $code) {
            $result = $results[$id] ?? ['error' => 'No result from the converter'];
            if (isset($result['code'])) {
                $converted[$id] = base64_decode($result['code'], true);
                $report['before'] += strlen($code);
                $report['after'] += strlen($converted[$id]);
            } elseif (empty($result['binary'])) {
                $report['failed'][$id] = (string) ($result['error'] ?? 'Unknown error');
            }
        }

        if (!$dryRun && $converted) {
            $db->beginTransaction();
            try {
                foreach ($converted as $id => $file) {
                    openrider_execute($update, ['id' => $id, 'code' => $file], ['code']);
                }
                $db->commit();
            } catch (Throwable $error) {
                $db->rollBack();
                throw $error;
            }
        }
        $report['converted'] += count($converted);

        $done += count($ids);
        migrate_log(sprintf('%s: %d / %d tracks', $table, $done, $total));
    }

    return $report;
}

/** Bytes as `12.3 MB`, or `4.5 KB` under a megabyte. */
function migrate_size(int $bytes): string
{
    return $bytes < 1024 * 1024
        ? sprintf('%.1f KB', $bytes / 1024)
        : sprintf('%.1f MB', $bytes / 1024 / 1024);
}

function migrate_main(array $argv): int
{
    $dryRun = in_array('--dry-run', $argv, true);
    if (!is_file(MIGRATE_CONVERTER)) {
        fwrite(STDERR, 'Converter not built: ' . MIGRATE_CONVERTER . ', run npm run build' . PHP_EOL);
        return 1;
    }
    // A batch holds a few large tracks, with their base 64 and their track files
    if (ini_get('memory_limit') !== '-1') {
        ini_set('memory_limit', '1024M');
    }

    $db = openrider_db();
    $tables = array_values(array_filter(
        ['TRACKS', 'LOCAL_UPLOADS'],
        fn (string $table) => migrate_has_table($db, $table)
    ));
    migrate_log(($dryRun ? 'Dry run, nothing written: ' : 'Migrating: ') . implode(', ', $tables));

    $failed = 0;
    foreach ($tables as $table) {
        if (!$dryRun) {
            migrate_column($db, $table);
        }
        $report = migrate_table($db, $table, $dryRun);
        migrate_log(sprintf(
            '%s: %d tracks, %d already converted, %d %s (%s to %s), %d failed',
            $table,
            $report['rows'],
            $report['binary'],
            $report['converted'],
            $dryRun ? 'to convert' : 'converted',
            migrate_size($report['before']),
            migrate_size($report['after']),
            count($report['failed'])
        ));
        foreach ($report['failed'] as $id => $error) {
            migrate_log("  $table #$id kept as it is: $error");
        }
        $failed += count($report['failed']);
    }

    return $failed > 0 ? 1 : 0;
}

exit(migrate_main($argv));
