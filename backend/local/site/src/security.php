<?php

/**
 * Protection of the requests posted to the sample website: their origin, their rate, the size and
 * format of the uploads, the verification of the ghosts by replaying them, and the analysis of
 * their inputs sending the suspicious ones to the admins.
 */

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/format.php';

/** Largest track code or editor file uploaded, in bytes. */
const SITE_TRACK_MAX_BYTES = 16 * 1024 * 1024;

/** Largest thumbnail once decoded, in bytes, and its size in pixels, fixed by the game. */
const SITE_THUMBNAIL_MAX_BYTES = 1024 * 1024,
    SITE_THUMBNAIL_WIDTH = 500,
    SITE_THUMBNAIL_HEIGHT = 300;

/** Largest ghost string, in bytes. */
const SITE_GHOST_MAX_BYTES = 1024 * 1024;

/**
 * Ghost strings as the game writes them: the toggle times of the five controls, the time and the
 * bike, without name (see GhostParser of the game).
 */
const SITE_GHOST_PATTERN =
    '/^(?:[0-9]+(?: [0-9]+)*)?(?:,(?:[0-9]+(?: [0-9]+)*)?){4},[0-9]+,(?:BMX|MTB)$/';

/** Command line replaying the ghosts, built with the game (see server/verify of the game). */
const SITE_GHOST_VERIFIER = __DIR__ . '/../../../../dist/verify-ghost.cjs';

/** Longest verification of a ghost, in seconds, as given to the verifier. */
const SITE_VERIFY_TIMEOUT = 60;

/**
 * Rate limits, by action: the number of events allowed, and the period they are counted over,
 * in seconds.
 */
const SITE_RATE_LIMITS = [
    // Uploads of tracks and drafts, and ghosts, per account
    'upload' => [30, 3600],
    'ghost' => [60, 3600],
    // Thumbs up given or taken back, per account
    'thumb' => [120, 3600],
    // Failed logins, per address and per user name
    'login-address' => [20, 900],
    'login-name' => [10, 900],
    // New accounts, per address
    'register' => [5, 3600],
];

/**
 * Whether a posted request comes from a page of the site, by its `Origin` header. The requests
 * without one are accepted: older browsers do not send it, and the CSRF tokens of the forms and
 * the SameSite session cookie still protect them.
 */
function site_check_origin(): bool
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if ($origin === null) {
        return true;
    }

    $host = parse_url($origin, PHP_URL_HOST);
    $port = parse_url($origin, PHP_URL_PORT);
    // `null` origins, e.g. sandboxed frames, have no host and never match
    return is_string($host)
        && strcasecmp($host . ($port ? ":$port" : ''), $_SERVER['HTTP_HOST'] ?? '') === 0;
}

/** Address of the client, the subject of the rate limits without account. */
function site_client_address(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/**
 * Whether an action reached its rate limit for a subject (an account, an address, a name).
 *
 * @param string $action Key of SITE_RATE_LIMITS.
 */
function site_rate_limited(PDO $db, string $action, string $subject): bool
{
    [$count, $period] = SITE_RATE_LIMITS[$action];
    return site_count_events($db, $action, $subject, time() - $period) >= $count;
}

/**
 * Counts an action for its rate limit, e.g. an upload, or a failed login.
 *
 * @param string $action Key of SITE_RATE_LIMITS.
 */
function site_record_event(PDO $db, string $action, string $subject): void
{
    site_insert_event($db, $action, $subject, time());

    // Now and then, drops the events older than every period
    if (random_int(1, 100) === 1) {
        site_delete_events_before($db, time() - max(array_column(SITE_RATE_LIMITS, 1)));
    }
}

/**
 * Counts an action for its rate limit, unless the limit is reached.
 *
 * @return bool Whether the action is allowed.
 */
function site_take_rate_limit(PDO $db, string $action, string $subject): bool
{
    if (site_rate_limited($db, $action, $subject)) {
        return false;
    }

    site_record_event($db, $action, $subject);
    return true;
}

/** Whether a thumbnail, base64 encoded, is a PNG of the size the game renders them at. */
function site_check_thumbnail(string $thumbnail): bool
{
    $png = base64_decode($thumbnail, true);
    // The PNG signature first: reading the size of other data logs notices
    if (
        $png === false
        || strlen($png) > SITE_THUMBNAIL_MAX_BYTES
        || strncmp($png, "\x89PNG\r\n\x1a\n", 8) !== 0
    ) {
        return false;
    }

    $size = getimagesizefromstring($png);
    return $size !== false
        && $size[0] === SITE_THUMBNAIL_WIDTH
        && $size[1] === SITE_THUMBNAIL_HEIGHT
        && $size[2] === IMAGETYPE_PNG;
}

/**
 * Thresholds of the analysis of the inputs of the ghosts, past which an admin reviews them, see
 * site_analyse_ghost(). Measured on runs played by hand, holding at most 2 one tick presses and
 * 15 toggles a second on tracks of several minutes.
 */
const SITE_REVIEW_ONE_TICK_PRESSES = 5,
    SITE_REVIEW_TOGGLES_PER_SECOND = 25,
    SITE_REVIEW_RECORD_RATIO = 0.8;

/**
 * Looks for the signs of a run played by a program in the inputs of a ghost: a human hardly
 * presses a key for a single tick (20 ms), or toggles keys dozens of times a second, and rarely
 * beats a record by far. Pausing to change the keys (spacebarring) gives neither.
 *
 * The turn key is left out of the presses: the game records each turn as a press of one tick.
 *
 * @param int|null $record Best time of the track before this ghost, null without any.
 * @return string[] Why the ghost looks suspicious, empty when it does not.
 */
function site_analyse_ghost(string $ghostString, int $time, ?int $record): array
{
    $fields = explode(',', $ghostString);
    $toggles = [];
    $oneTickPresses = 0;
    // Up, down, left and right, then the turn key
    for ($key = 0; $key < 5; $key++) {
        $times = $fields[$key] === '' ? [] : array_map('intval', explode(' ', $fields[$key]));
        array_push($toggles, ...$times);
        for ($press = 0; $key < 4 && $press + 1 < count($times); $press += 2) {
            if ($times[$press + 1] - $times[$press] === 1) {
                $oneTickPresses++;
            }
        }
    }

    // Most toggles of all the keys within a second, over a sliding window
    sort($toggles);
    $mostPerSecond = 0;
    for ($last = 0, $first = 0; $last < count($toggles); $last++) {
        while ($toggles[$last] - $toggles[$first] >= SITE_TICKS_PER_SECOND) {
            $first++;
        }
        $mostPerSecond = max($mostPerSecond, $last - $first + 1);
    }

    $reasons = [];
    if ($oneTickPresses > SITE_REVIEW_ONE_TICK_PRESSES) {
        $reasons[] = "$oneTickPresses key presses of a single tick";
    }
    if ($mostPerSecond > SITE_REVIEW_TOGGLES_PER_SECOND) {
        $reasons[] = "$mostPerSecond key toggles within a second";
    }
    if ($record !== null && $time < $record * SITE_REVIEW_RECORD_RATIO) {
        $percent = (int) round(100 * (1 - $time / $record));
        $reasons[] = "$percent% faster than the record";
    }

    return $reasons;
}

/** Whether a ghost string has the format the game writes. */
function site_check_ghost_string(string $ghostString): bool
{
    return strlen($ghostString) <= SITE_GHOST_MAX_BYTES
        && preg_match(SITE_GHOST_PATTERN, $ghostString) === 1;
}

/**
 * Verifies a ghost by replaying it on its track with the verifier of the game, run by Node:
 * a forged ghost does not reach every target at its time.
 *
 * Configured with `OPENRIDER_NODE`, the Node executable (`node` by default), and
 * `OPENRIDER_VERIFY_GHOSTS`, `0` to save the ghosts without verifying them.
 *
 * @return string|null Why the ghost is refused, null when it is valid.
 * @throws RuntimeException When the verifier cannot run.
 */
function site_verify_ghost(string $trackCode, string $ghostString, int $time): ?string
{
    if (getenv('OPENRIDER_VERIFY_GHOSTS') === '0') {
        return null;
    }

    $verdict = site_run_verifier([
        'trackCode' => $trackCode,
        'ghostString' => $ghostString,
        'time' => $time,
    ]);
    return $verdict['valid'] ? null : (string) $verdict['reason'];
}

/**
 * Verifies an endurance run by replaying it on its track, a seed on a version of the generator,
 * as site_verify_ghost() does: a forged run does not fall at its time. The replay also measures
 * its distance.
 *
 * @param int $claimed Distance claimed by the game, in whole meters, kept without verification.
 * @return array Why the run is refused, null when it is valid, then its distance in whole
 *   meters.
 * @throws RuntimeException When the verifier cannot run.
 */
function site_verify_endurance_run(
    int $seed,
    int $version,
    string $ghostString,
    int $time,
    int $claimed
): array {
    if (getenv('OPENRIDER_VERIFY_GHOSTS') === '0') {
        return [null, $claimed];
    }

    $verdict = site_run_verifier([
        'seed' => $seed,
        'version' => $version,
        'ghostString' => $ghostString,
        'time' => $time,
    ]);
    return $verdict['valid']
        ? [null, (int) floor((float) ($verdict['distance'] ?? 0))]
        : [(string) $verdict['reason'], 0];
}

/**
 * Runs the verifier of the game with Node (see src/verify of the game), giving it its input as
 * JSON.
 *
 * @return array The verdict, `valid` and `reason`, and `distance` for an endurance run.
 * @throws RuntimeException When the verifier cannot run.
 */
function site_run_verifier(array $input): array
{
    if (!is_file(SITE_GHOST_VERIFIER)) {
        throw new RuntimeException('Ghost verifier not built: ' . SITE_GHOST_VERIFIER);
    }

    $node = getenv('OPENRIDER_NODE') ?: 'node';
    $pipes = [];
    // An array runs the command without shell
    $process = proc_open(
        [$node, SITE_GHOST_VERIFIER],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes
    );
    if (!is_resource($process)) {
        throw new RuntimeException("Cannot run the ghost verifier with $node");
    }

    // The verifier gives up by itself after its timeout, PHP waits a bit longer
    set_time_limit(SITE_VERIFY_TIMEOUT + 30);
    $json = json_encode($input);
    // A pipe may take a large input in several writes
    for ($written = 0; $written < strlen($json); $written += $count) {
        $count = fwrite($pipes[0], substr($json, $written, 1 << 16));
        if (!$count) {
            break;
        }
    }
    fclose($pipes[0]);
    // The verifier writes its verdict once all its input is read, and little else
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);

    $verdict = json_decode((string) $output, true);
    if ($status !== 0 || !is_array($verdict) || !isset($verdict['valid'])) {
        throw new RuntimeException("Ghost verifier failed ($status): " . trim((string) $errors));
    }

    return $verdict;
}
