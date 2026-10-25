<?php

/**
 * Queries of the sample website.
 *
 * The site reads the tables of the backend, and keeps in its own tables:
 *
 * - `LOCAL_USERS`: the accounts, a user name and a password hash;
 * - `LOCAL_TRACK_DETAILS`: the titles, descriptions and authors of the published tracks, the
 *   backend storing none;
 * - `LOCAL_GHOST_OWNERS`: the account of each ghost saved by the site;
 * - `LOCAL_UPLOADS`: the tracks uploaded by its editor pages, each one by an account, out of the
 *   backend until they are published. An upload is either a track code, published to `TRACKS`
 *   with its title and description, or an editor file, which cannot be raced and is saved as a
 *   draft once named;
 * - `LOCAL_RATE_EVENTS`: the recent actions counted by the rate limits, see security.php;
 * - `LOCAL_ENDURANCE_RUNS`: the best endurance run of each account on each track of the day,
 *   ranked on the endurance page.
 *
 * The tracks and ghosts uploaded without the site, or before the accounts, have no account.
 */

require_once __DIR__ . '/../../../db/api.php';

/** Connects to the backend database, creating the tables of the site missing from it. */
function site_db(): PDO
{
    $db = openrider_db();
    site_create_tables($db);

    return $db;
}

/** Creates the tables and columns of the site missing from the backend database. */
function site_create_tables(PDO $db): void
{
    // SQLite and PostgreSQL do not share a syntax for auto-incremented ids
    $id = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql'
        ? 'SERIAL PRIMARY KEY'
        : 'INTEGER PRIMARY KEY AUTOINCREMENT';

    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_USERS" ('
        . "\"ID\" $id, \"NAME\" TEXT NOT NULL, \"PASSWORDHASH\" TEXT NOT NULL)"
    );
    // User names are unique whatever their case
    $db->exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_local_users_name ON "LOCAL_USERS" (LOWER("NAME"))'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_TRACK_DETAILS" ('
        . '"TRACKID" INTEGER PRIMARY KEY REFERENCES "TRACKS" ("ID"),'
        . ' "TITLE" TEXT NOT NULL, "DESCRIPTION" TEXT NOT NULL)'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_GHOST_OWNERS" ('
        . '"GHOSTID" INTEGER PRIMARY KEY REFERENCES "GHOSTS" ("ID"),'
        . ' "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"))'
    );
    // Title and description stay null until an editor file is saved as a draft
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_UPLOADS" ('
        . "\"ID\" $id, \"CODE\" TEXT NOT NULL, \"THUMBNAIL\" TEXT,"
        . ' "TITLE" TEXT, "DESCRIPTION" TEXT)'
    );
    // Time as a Unix timestamp
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_RATE_EVENTS" ('
        . '"ACTION" TEXT NOT NULL, "SUBJECT" TEXT NOT NULL, "TIME" INTEGER NOT NULL)'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_rate_events'
        . ' ON "LOCAL_RATE_EVENTS" ("ACTION", "SUBJECT", "TIME")'
    );

    // The ghosts waiting for an admin, with why their inputs look suspicious
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_GHOST_REVIEWS" ('
        . '"GHOSTID" INTEGER PRIMARY KEY REFERENCES "GHOSTS" ("ID"), "REASONS" TEXT NOT NULL)'
    );

    // The best endurance run of each account on each track of the day, by seed (up to 2^32 - 1,
    // past the 32 bits integers of PostgreSQL), its distance in whole meters and its time in
    // ticks. Why it waits for an admin, null when it ranks
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_ENDURANCE_RUNS" ('
        . "\"ID\" $id, \"SEED\" BIGINT NOT NULL,"
        . ' "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "GHOSTSTRING" TEXT NOT NULL, "DISTANCE" INTEGER NOT NULL, "TIME" INTEGER NOT NULL,'
        . ' "REVIEW" TEXT)'
    );
    $db->exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_local_endurance_runs_user'
        . ' ON "LOCAL_ENDURANCE_RUNS" ("SEED", "USERID")'
    );

    // Added with the accounts: null for the tracks and uploads made before them
    $userColumn = 'INTEGER REFERENCES "LOCAL_USERS" ("ID")';
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'USERID', $userColumn);
    site_add_column($db, 'LOCAL_UPLOADS', 'USERID', $userColumn);

    // Added with the verification: null for the tracks published before it, unverified. Not a
    // reference: a track stays verified when its verifier deletes their account
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'VERIFIERID', 'INTEGER');
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'VERIFICATIONGHOSTID', 'INTEGER');
    // The verifier of a track code waiting for verification, then the verifying run, and why it
    // waits for an admin, null when it does not
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFIERID', $userColumn);
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFICATIONGHOST', 'TEXT');
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFICATIONTIME', 'INTEGER');
    site_add_column($db, 'LOCAL_UPLOADS', 'REVIEW', 'TEXT');
}

/** Adds a column to a table of the site created before it, keeping its rows. */
function site_add_column(PDO $db, string $table, string $column, string $definition): void
{
    // Reads the columns of the table: selecting a missing column does not fail on SQLite, which
    // takes an unknown quoted name for a string
    $statement = $db->query("SELECT * FROM \"$table\" WHERE 1 = 0");
    for ($index = 0; $index < $statement->columnCount(); $index++) {
        if ($statement->getColumnMeta($index)['name'] === $column) {
            return;
        }
    }

    $db->exec("ALTER TABLE \"$table\" ADD COLUMN \"$column\" $definition");
}

/** An account by its id, or null when it does not exist. */
function site_find_user(PDO $db, int $userId): ?array
{
    $statement = $db->prepare('SELECT "ID", "NAME" FROM "LOCAL_USERS" WHERE "ID" = :id');
    $statement->execute(['id' => $userId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * Condition on `LOCAL_USERS u` keeping the names holding a text whatever its case, `:pattern`
 * being the text escaped by site_like_pattern().
 */
const SITE_USER_NAME_SEARCH = 'LOWER(u."NAME") LIKE LOWER(:pattern) ESCAPE \'!\'';

/** LIKE pattern finding a text anywhere, its `%` and `_` (allowed in user names) as they are. */
function site_like_pattern(string $text): string
{
    return '%' . strtr($text, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
}

/**
 * Accounts by name, with the number of tracks they published (`TRACKS`) and of their ghosts not
 * waiting for an admin (`GHOSTS`).
 *
 * @param string $search Text of the names to list, empty for every account.
 * @return array[]
 */
function site_find_users(PDO $db, string $search, int $offset, int $limit): array
{
    $statement = $db->prepare(
        'SELECT u."ID", u."NAME",'
        . ' (SELECT COUNT(*) FROM "LOCAL_TRACK_DETAILS" d WHERE d."USERID" = u."ID") AS "TRACKS",'
        . ' (SELECT COUNT(*) FROM "LOCAL_GHOST_OWNERS" o WHERE o."USERID" = u."ID"'
        . ' AND o."GHOSTID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")) AS "GHOSTS"'
        . ' FROM "LOCAL_USERS" u WHERE ' . SITE_USER_NAME_SEARCH
        . ' ORDER BY LOWER(u."NAME") LIMIT :limit OFFSET :offset'
    );
    $statement->bindValue('pattern', site_like_pattern($search));
    $statement->bindValue('limit', $limit, PDO::PARAM_INT);
    $statement->bindValue('offset', $offset, PDO::PARAM_INT);
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Number of accounts whose name holds a text.
 *
 * @param string $search Text of the names to count, empty for every account.
 */
function site_count_users(PDO $db, string $search): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_USERS" u WHERE ' . SITE_USER_NAME_SEARCH
    );
    $statement->execute(['pattern' => site_like_pattern($search)]);

    return (int) $statement->fetchColumn();
}

/**
 * An account by its name, whatever its case, with its password hash (`PASSWORDHASH`), or null
 * when it does not exist.
 */
function site_find_user_by_name(PDO $db, string $name): ?array
{
    $statement = $db->prepare(
        'SELECT "ID", "NAME", "PASSWORDHASH" FROM "LOCAL_USERS" WHERE LOWER("NAME") = LOWER(:name)'
    );
    $statement->execute(['name' => $name]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * Creates an account. The first one takes over the drafts and uploads made before the accounts,
 * which would be lost otherwise: nobody else can open them.
 *
 * @return int|null Id of the account, null when the name is taken.
 */
function site_insert_user(PDO $db, string $name, string $passwordHash): ?int
{
    $db->beginTransaction();
    try {
        if (site_find_user_by_name($db, $name) !== null) {
            $db->rollBack();
            return null;
        }
        $first = (int) $db->query('SELECT COUNT(*) FROM "LOCAL_USERS"')->fetchColumn() === 0;

        $statement = $db->prepare(
            'INSERT INTO "LOCAL_USERS" ("NAME", "PASSWORDHASH") VALUES (:name, :hash)'
            . ' RETURNING "ID"'
        );
        $statement->execute(['name' => $name, 'hash' => $passwordHash]);
        $userId = (int) $statement->fetchColumn();
        // Closes the statement, SQLite refusing to commit while it is still running
        $statement->closeCursor();

        if ($first) {
            $db->prepare('UPDATE "LOCAL_UPLOADS" SET "USERID" = :id WHERE "USERID" IS NULL')
                ->execute(['id' => $userId]);
        }

        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }

    return $userId;
}

/** Condition on `GHOSTS g` keeping the ghosts not waiting for an admin. */
const SITE_REVIEWED_GHOST = 'g."ID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")';

/**
 * The published tracks, newest first, with their title (null for the tracks uploaded to the
 * backend without the site), author name (`AUTHOR`, null without account), verifier id
 * (`VERIFIERID`, null for an unverified track), number of ghosts (`GHOSTS`) and best time
 * (`BEST`, null without ghost). The ghosts waiting for an admin are not counted.
 *
 * @param int|null $userId Author of the tracks, null for every track.
 * @return array[]
 */
function site_find_tracks(PDO $db, ?int $userId = null): array
{
    $statement = $db->prepare(
        'SELECT t."ID", t."CODE", t."THUMBNAIL", d."TITLE", d."VERIFIERID",'
        . ' u."NAME" AS "AUTHOR", COUNT(g."ID") AS "GHOSTS", MIN(g."TIME") AS "BEST"'
        . ' FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = d."USERID"'
        . ' LEFT JOIN "GHOSTS" g ON g."TRACKID" = t."ID" AND ' . SITE_REVIEWED_GHOST
        . ($userId === null ? '' : ' WHERE d."USERID" = :userId')
        . ' GROUP BY t."ID", t."CODE", t."THUMBNAIL", d."TITLE", d."VERIFIERID", u."NAME"'
        . ' ORDER BY t."ID" DESC'
    );
    $statement->execute($userId === null ? [] : ['userId' => $userId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * A published track with its title, description, author id (`USERID`) and name (`AUTHOR`),
 * verifier id (`VERIFIERID`) and name (`VERIFIER`) and verifying ghost (`VERIFICATIONGHOSTID`),
 * null when the site has none, or null when it does not exist.
 */
function site_find_track(PDO $db, int $trackId): ?array
{
    $statement = $db->prepare(
        'SELECT t."ID", t."CODE", d."TITLE", d."DESCRIPTION", d."USERID", u."NAME" AS "AUTHOR",'
        . ' d."VERIFIERID", v."NAME" AS "VERIFIER", d."VERIFICATIONGHOSTID"'
        . ' FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = d."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = d."VERIFIERID"'
        . ' WHERE t."ID" = :id'
    );
    $statement->execute(['id' => $trackId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * The ghosts of a track, fastest first, with the id (`USERID`) and the name (`RIDER`) of their
 * account, null for the ghosts saved without the site, and why they wait for an admin
 * (`REVIEW`, null when they do not).
 *
 * @return array[]
 */
function site_find_ghosts(PDO $db, int $trackId): array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."GHOSTSTRING", g."TIME", o."USERID", u."NAME" AS "RIDER",'
        . ' r."REASONS" AS "REVIEW"'
        . ' FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE g."TRACKID" = :id ORDER BY g."TIME", g."ID"'
    );
    $statement->execute(['id' => $trackId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Best time of a track among the ghosts not waiting for an admin, null without any. */
function site_find_best_time(PDO $db, int $trackId): ?int
{
    $statement = $db->prepare(
        'SELECT MIN(g."TIME") FROM "GHOSTS" g WHERE g."TRACKID" = :id AND ' . SITE_REVIEWED_GHOST
    );
    $statement->execute(['id' => $trackId]);
    $best = $statement->fetchColumn();

    return $best === null || $best === false ? null : (int) $best;
}

/**
 * The ghosts of an account, newest first, with the title of their track (`TITLE`, null when the
 * site has none), their rank on it among the ghosts not waiting for an admin (`RANK`, from 1),
 * and why they wait for an admin (`REVIEW`, null when they do not).
 *
 * @param bool $withReviews Whether the ghosts waiting for an admin are listed too: for their
 * own account and the admins.
 * @return array[]
 */
function site_find_user_ghosts(PDO $db, int $userId, bool $withReviews = false): array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TRACKID", g."TIME", d."TITLE", r."REASONS" AS "REVIEW",'
        . ' (SELECT COUNT(*) FROM "GHOSTS" f WHERE f."TRACKID" = g."TRACKID"'
        . ' AND f."ID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")'
        . ' AND (f."TIME" < g."TIME" OR (f."TIME" = g."TIME" AND f."ID" < g."ID"))) + 1 AS "RANK"'
        . ' FROM "GHOSTS" g'
        . ' JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE o."USERID" = :userId' . ($withReviews ? '' : ' AND r."GHOSTID" IS NULL')
        . ' ORDER BY g."ID" DESC'
    );
    $statement->execute(['userId' => $userId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Saves the ghost of an account on a published track, as the ghostupload endpoint of the
 * backend does.
 *
 * @param string|null $review Why the ghost waits for an admin, null when it does not.
 * @return int|null Id of the ghost, null when the track does not exist.
 */
function site_insert_ghost(
    PDO $db,
    int $userId,
    string $ghostString,
    int $trackId,
    int $time,
    ?string $review = null
): ?int {
    $insert = function () use ($db, $userId, $ghostString, $trackId, $time, $review) {
        $track = $db->prepare('SELECT "ID" FROM "TRACKS" WHERE "ID" = :trackId');
        $track->execute(['trackId' => $trackId]);
        $exists = $track->fetch() !== false;
        $track->closeCursor();
        if (!$exists) {
            return null;
        }

        $ghostId = site_insert_ghost_row($db, $userId, $ghostString, $trackId, $time);
        if ($review !== null) {
            site_insert_ghost_review($db, $ghostId, $review);
        }

        return $ghostId;
    };

    return site_transaction($db, $insert);
}

/** Inserts a ghost and its account, in the transaction of the caller, returning its id. */
function site_insert_ghost_row(
    PDO $db,
    int $userId,
    string $ghostString,
    int $trackId,
    int $time
): int {
    $statement = $db->prepare(
        'INSERT INTO "GHOSTS" ("GHOSTSTRING", "TRACKID", "TIME")'
        . ' VALUES (:ghostString, :trackId, :time) RETURNING "ID"'
    );
    $statement->execute(['ghostString' => $ghostString, 'trackId' => $trackId, 'time' => $time]);
    $ghostId = (int) $statement->fetchColumn();
    $statement->closeCursor();

    $db->prepare('INSERT INTO "LOCAL_GHOST_OWNERS" ("GHOSTID", "USERID") VALUES (:id, :userId)')
        ->execute(['id' => $ghostId, 'userId' => $userId]);

    return $ghostId;
}

/**
 * Keeps a track uploaded by an editor page, out of the backend.
 *
 * @param string|null $thumbnail Base64 PNG, without the data URL prefix.
 * @return int Id of the upload.
 */
function site_insert_upload(PDO $db, int $userId, string $code, ?string $thumbnail): int
{
    $statement = $db->prepare(
        'INSERT INTO "LOCAL_UPLOADS" ("USERID", "CODE", "THUMBNAIL")'
        . ' VALUES (:userId, :code, :thumbnail) RETURNING "ID"'
    );
    $statement->execute(['userId' => $userId, 'code' => $code, 'thumbnail' => $thumbnail]);

    return (int) $statement->fetchColumn();
}

/**
 * An upload of an account, or null when it does not exist, was published, or belongs to another
 * account.
 */
function site_find_upload(PDO $db, int $uploadId, int $userId): ?array
{
    $upload = site_find_any_upload($db, $uploadId);
    return $upload !== null && (int) $upload['USERID'] === $userId ? $upload : null;
}

/**
 * An upload whatever its account, or null: with its account (`USERID`, `AUTHOR`), and for a
 * track code waiting for verification its verifier (`VERIFIERID`, `VERIFIER`), verifying run
 * (`VERIFICATIONGHOST`, `VERIFICATIONTIME`) and why that run waits for an admin (`REVIEW`).
 */
function site_find_any_upload(PDO $db, int $uploadId): ?array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."CODE", up."THUMBNAIL", up."TITLE", up."DESCRIPTION", up."USERID",'
        . ' u."NAME" AS "AUTHOR", up."VERIFIERID", v."NAME" AS "VERIFIER",'
        . ' up."VERIFICATIONGHOST", up."VERIFICATIONTIME", up."REVIEW"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = up."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."ID" = :id'
    );
    $statement->execute(['id' => $uploadId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Condition on `LOCAL_UPLOADS up` keeping the editor files, which never start like track codes. */
const SITE_EDITOR_FILE = 'LTRIM(up."CODE") LIKE \'{%\'';

/**
 * The drafts of an account: its editor files saved with a title, newest first.
 *
 * @return array[]
 */
function site_find_drafts(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."THUMBNAIL", up."TITLE", up."DESCRIPTION" FROM "LOCAL_UPLOADS" up'
        . ' WHERE up."TITLE" IS NOT NULL AND up."USERID" = :userId AND ' . SITE_EDITOR_FILE
        . ' ORDER BY up."ID" DESC'
    );
    $statement->execute(['userId' => $userId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * The track codes waiting for verification that an account made or verifies, newest first, with
 * their account (`AUTHOR`), verifier (`VERIFIERID`, `VERIFIER`), verifying time
 * (`VERIFICATIONTIME`, null before) and review (`REVIEW`).
 *
 * @return array[]
 */
function site_find_pending_tracks(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."THUMBNAIL", up."TITLE", up."USERID", u."NAME" AS "AUTHOR",'
        . ' up."VERIFIERID", v."NAME" AS "VERIFIER", up."VERIFICATIONTIME", up."REVIEW"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = up."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."TITLE" IS NOT NULL AND NOT ' . SITE_EDITOR_FILE
        . ' AND (up."USERID" = :userId OR up."VERIFIERID" = :verifierId)'
        . ' ORDER BY up."ID" DESC'
    );
    $statement->execute(['userId' => $userId, 'verifierId' => $userId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Sends an uploaded track code to verification, with its title, description and verifier.
 */
function site_submit_for_verification(
    PDO $db,
    int $uploadId,
    string $title,
    string $description,
    int $verifierId
): void {
    $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "TITLE" = :title, "DESCRIPTION" = :description,'
        . ' "VERIFIERID" = :verifierId WHERE "ID" = :id'
    )->execute([
        'id' => $uploadId,
        'title' => $title,
        'description' => $description,
        'verifierId' => $verifierId,
    ]);
}

/** Gives the verification of a track waiting for it to another account. */
function site_set_verifier(PDO $db, int $uploadId, int $verifierId): void
{
    $db->prepare('UPDATE "LOCAL_UPLOADS" SET "VERIFIERID" = :verifierId WHERE "ID" = :id')
        ->execute(['id' => $uploadId, 'verifierId' => $verifierId]);
}

/**
 * Saves the verifying run of a track, or drops it with null values.
 *
 * @param string|null $review Why the run waits for an admin, null when it does not.
 */
function site_set_verification(
    PDO $db,
    int $uploadId,
    ?string $ghostString,
    ?int $time,
    ?string $review
): void {
    $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "VERIFICATIONGHOST" = :ghost, "VERIFICATIONTIME" = :time,'
        . ' "REVIEW" = :review WHERE "ID" = :id'
    )->execute(['id' => $uploadId, 'ghost' => $ghostString, 'time' => $time, 'review' => $review]);
}

/** Approves the verifying run of a track waiting for an admin. */
function site_approve_verification(PDO $db, int $uploadId): void
{
    $db->prepare('UPDATE "LOCAL_UPLOADS" SET "REVIEW" = NULL WHERE "ID" = :id')
        ->execute(['id' => $uploadId]);
}

/**
 * The tracks waiting for an admin: their verifying run looks suspicious.
 *
 * @return array[]
 */
function site_find_verification_reviews(PDO $db): array
{
    return $db->query(
        'SELECT up."ID", up."TITLE", up."VERIFICATIONTIME", up."REVIEW", v."NAME" AS "VERIFIER"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."REVIEW" IS NOT NULL ORDER BY up."ID"'
    )->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * The ghosts waiting for an admin, oldest first, with their track (`TRACKID`, `TITLE`) and
 * account (`RIDER`).
 *
 * @return array[]
 */
function site_find_ghost_reviews(PDO $db): array
{
    return $db->query(
        'SELECT g."ID", g."TRACKID", g."TIME", d."TITLE", u."NAME" AS "RIDER",'
        . ' r."REASONS" AS "REVIEW"'
        . ' FROM "LOCAL_GHOST_REVIEWS" r'
        . ' JOIN "GHOSTS" g ON g."ID" = r."GHOSTID"'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' ORDER BY g."ID"'
    )->fetchAll(PDO::FETCH_ASSOC);
}

/** Sends a ghost to the admins, with why its inputs look suspicious. */
function site_insert_ghost_review(PDO $db, int $ghostId, string $reasons): void
{
    $db->prepare('INSERT INTO "LOCAL_GHOST_REVIEWS" ("GHOSTID", "REASONS") VALUES (:id, :reasons)')
        ->execute(['id' => $ghostId, 'reasons' => $reasons]);
}

/** Approves a ghost waiting for an admin, listing it with the others. */
function site_approve_ghost(PDO $db, int $ghostId): void
{
    $db->prepare('DELETE FROM "LOCAL_GHOST_REVIEWS" WHERE "GHOSTID" = :id')
        ->execute(['id' => $ghostId]);
}

/** Saves an uploaded editor file as a draft, with its title and description. */
function site_save_draft(PDO $db, int $uploadId, string $title, string $description): void
{
    $statement = $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "TITLE" = :title, "DESCRIPTION" = :description'
        . ' WHERE "ID" = :id'
    );
    $statement->execute(['id' => $uploadId, 'title' => $title, 'description' => $description]);
}

/**
 * Replaces the editor file and the thumbnail of a draft, uploaded again from its editor page.
 *
 * @param string|null $thumbnail Base64 PNG, without the data URL prefix.
 */
function site_update_draft(PDO $db, int $draftId, string $code, ?string $thumbnail): void
{
    $statement = $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "CODE" = :code, "THUMBNAIL" = :thumbnail WHERE "ID" = :id'
    );
    $statement->execute(['id' => $draftId, 'code' => $code, 'thumbnail' => $thumbnail]);
}

/**
 * Publishes a verified track code: adds it to the tracks of the backend, as its trackupload
 * endpoint does, with its title, description, author and verifier, saves the verifying run as
 * the first ghost of the track, and removes the upload.
 *
 * @param array $upload Verified upload, see site_find_any_upload().
 * @return int Id of the published track.
 */
function site_publish_verified(PDO $db, array $upload): int
{
    return site_transaction($db, function () use ($db, $upload) {
        $statement = $db->prepare(
            'INSERT INTO "TRACKS" ("CODE", "THUMBNAIL") VALUES (:code, :thumbnail) RETURNING "ID"'
        );
        $statement->execute(['code' => $upload['CODE'], 'thumbnail' => $upload['THUMBNAIL']]);
        $trackId = (int) $statement->fetchColumn();
        // Closes the statement, SQLite refusing to commit while it is still running
        $statement->closeCursor();

        $ghostId = site_insert_ghost_row(
            $db,
            (int) $upload['VERIFIERID'],
            $upload['VERIFICATIONGHOST'],
            $trackId,
            (int) $upload['VERIFICATIONTIME']
        );

        $db->prepare(
            'INSERT INTO "LOCAL_TRACK_DETAILS"'
            . ' ("TRACKID", "TITLE", "DESCRIPTION", "USERID", "VERIFIERID", "VERIFICATIONGHOSTID")'
            . ' VALUES (:id, :title, :description, :userId, :verifierId, :ghostId)'
        )->execute([
            'id' => $trackId,
            'title' => $upload['TITLE'],
            'description' => $upload['DESCRIPTION'],
            'userId' => $upload['USERID'],
            'verifierId' => $upload['VERIFIERID'],
            'ghostId' => $ghostId,
        ]);

        $db->prepare('DELETE FROM "LOCAL_UPLOADS" WHERE "ID" = :id')
            ->execute(['id' => $upload['ID']]);

        return $trackId;
    });
}

/** A ghost with its track (`TRACKID`) and account (`USERID`, null without), or null. */
function site_find_ghost(PDO $db, int $ghostId): ?array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TRACKID", o."USERID" FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' WHERE g."ID" = :id'
    );
    $statement->execute(['id' => $ghostId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Counts the events of an action for a subject since a time (Unix timestamp). */
function site_count_events(PDO $db, string $action, string $subject, int $since): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_RATE_EVENTS"'
        . ' WHERE "ACTION" = :action AND "SUBJECT" = :subject AND "TIME" > :since'
    );
    $statement->execute(['action' => $action, 'subject' => $subject, 'since' => $since]);

    return (int) $statement->fetchColumn();
}

/** Records an event of an action for a subject, at a time (Unix timestamp). */
function site_insert_event(PDO $db, string $action, string $subject, int $time): void
{
    $db->prepare(
        'INSERT INTO "LOCAL_RATE_EVENTS" ("ACTION", "SUBJECT", "TIME")'
        . ' VALUES (:action, :subject, :time)'
    )->execute(['action' => $action, 'subject' => $subject, 'time' => $time]);
}

/** Drops the events older than a time (Unix timestamp). */
function site_delete_events_before(PDO $db, int $time): void
{
    $db->prepare('DELETE FROM "LOCAL_RATE_EVENTS" WHERE "TIME" < :time')
        ->execute(['time' => $time]);
}

/**
 * Runs queries in a transaction, rolled back when one of them fails.
 *
 * @return mixed What the queries return.
 */
function site_transaction(PDO $db, callable $queries)
{
    $db->beginTransaction();
    try {
        $result = $queries();
        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }

    return $result;
}

/** Deletes a ghost. */
function site_delete_ghost(PDO $db, int $ghostId): void
{
    site_transaction($db, function () use ($db, $ghostId) {
        site_delete_ghosts_by_id($db, [$ghostId]);
    });
}

/** Deletes a published track, with its details and all its ghosts. */
function site_delete_track(PDO $db, int $trackId): void
{
    site_transaction($db, function () use ($db, $trackId) {
        site_delete_tracks_by_id($db, [$trackId]);
    });
}

/** Deletes an upload or a draft. */
function site_delete_upload(PDO $db, int $uploadId): void
{
    $db->prepare('DELETE FROM "LOCAL_UPLOADS" WHERE "ID" = :id')->execute(['id' => $uploadId]);
}

/**
 * Deletes an account with everything it made: its tracks (with the ghosts of the other accounts
 * on them), its ghosts, and its drafts and uploads.
 */
function site_delete_user(PDO $db, int $userId): void
{
    site_transaction($db, function () use ($db, $userId) {
        $params = ['userId' => $userId];
        // Selected first: deleting the tracks and ghosts deletes the rows telling their account
        $trackIds = site_select_ids(
            $db,
            'SELECT "TRACKID" FROM "LOCAL_TRACK_DETAILS" WHERE "USERID" = :userId',
            $params
        );
        $ghostIds = site_select_ids(
            $db,
            'SELECT "GHOSTID" FROM "LOCAL_GHOST_OWNERS" WHERE "USERID" = :userId',
            $params
        );

        site_delete_tracks_by_id($db, $trackIds);
        site_delete_ghosts_by_id($db, $ghostIds);
        $db->prepare('DELETE FROM "LOCAL_ENDURANCE_RUNS" WHERE "USERID" = :userId')
            ->execute($params);
        // The tracks it was to verify go back to their authors, without its runs
        $db->prepare(
            'UPDATE "LOCAL_UPLOADS" SET "VERIFIERID" = "USERID", "VERIFICATIONGHOST" = NULL,'
            . ' "VERIFICATIONTIME" = NULL, "REVIEW" = NULL WHERE "VERIFIERID" = :userId'
        )->execute($params);
        $db->prepare('DELETE FROM "LOCAL_UPLOADS" WHERE "USERID" = :userId')->execute($params);
        $db->prepare('DELETE FROM "LOCAL_USERS" WHERE "ID" = :userId')->execute($params);
    });
}

/**
 * Ids selected by a query of one column.
 *
 * @return int[]
 */
function site_select_ids(PDO $db, string $query, array $params): array
{
    $statement = $db->prepare($query);
    $statement->execute($params);

    return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Deletes ghosts with their owners, in the transaction of the caller.
 *
 * @param int[] $ghostIds
 */
function site_delete_ghosts_by_id(PDO $db, array $ghostIds): void
{
    $reviews = $db->prepare('DELETE FROM "LOCAL_GHOST_REVIEWS" WHERE "GHOSTID" = :id');
    $owners = $db->prepare('DELETE FROM "LOCAL_GHOST_OWNERS" WHERE "GHOSTID" = :id');
    $ghosts = $db->prepare('DELETE FROM "GHOSTS" WHERE "ID" = :id');
    foreach ($ghostIds as $ghostId) {
        $reviews->execute(['id' => $ghostId]);
        $owners->execute(['id' => $ghostId]);
        $ghosts->execute(['id' => $ghostId]);
    }
}

/**
 * Deletes tracks with their details and all their ghosts, in the transaction of the caller.
 *
 * @param int[] $trackIds
 */
function site_delete_tracks_by_id(PDO $db, array $trackIds): void
{
    $details = $db->prepare('DELETE FROM "LOCAL_TRACK_DETAILS" WHERE "TRACKID" = :id');
    $tracks = $db->prepare('DELETE FROM "TRACKS" WHERE "ID" = :id');
    foreach ($trackIds as $trackId) {
        $params = ['id' => $trackId];
        site_delete_ghosts_by_id(
            $db,
            site_select_ids($db, 'SELECT "ID" FROM "GHOSTS" WHERE "TRACKID" = :id', $params)
        );
        $details->execute($params);
        $tracks->execute($params);
    }
}

/**
 * Condition on `LOCAL_ENDURANCE_RUNS e` keeping the runs ranked before a distance and a time:
 * further, or as far and faster.
 */
const SITE_ENDURANCE_BEFORE = '(e."DISTANCE" > :distance'
    . ' OR (e."DISTANCE" = :sameDistance AND e."TIME" < :time))';

/**
 * The best ranked endurance runs on a track, best first: further, then faster, then saved
 * first. Each one with its account (`NAME`).
 *
 * @return array[]
 */
function site_find_endurance_runs(PDO $db, int $seed, int $limit): array
{
    $statement = $db->prepare(
        'SELECT e."ID", e."USERID", e."DISTANCE", e."TIME", u."NAME"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."SEED" = :seed AND e."REVIEW" IS NULL'
        . ' ORDER BY e."DISTANCE" DESC, e."TIME", e."ID" LIMIT ' . $limit
    );
    $statement->execute(['seed' => $seed]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Number of ranked endurance runs on a track. */
function site_count_endurance_runs(PDO $db, int $seed): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_ENDURANCE_RUNS" WHERE "SEED" = :seed AND "REVIEW" IS NULL'
    );
    $statement->execute(['seed' => $seed]);

    return (int) $statement->fetchColumn();
}

/**
 * The endurance run of an account on a track, with its rank among the ranked runs (`RANK`, null
 * while it waits for an admin), or null without any.
 */
function site_find_endurance_run_of(PDO $db, int $seed, int $userId): ?array
{
    $statement = $db->prepare(
        'SELECT e."ID", e."USERID", e."DISTANCE", e."TIME", e."REVIEW", u."NAME"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."SEED" = :seed AND e."USERID" = :userId'
    );
    $statement->execute(['seed' => $seed, 'userId' => $userId]);
    $run = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$run) {
        return null;
    }

    $run['RANK'] = $run['REVIEW'] === null
        ? site_endurance_rank($db, $seed, (int) $run['DISTANCE'], (int) $run['TIME'])
        : null;
    return $run;
}

/** Rank a distance and a time would have among the ranked runs of a track, from 1. */
function site_endurance_rank(PDO $db, int $seed, int $distance, int $time): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_ENDURANCE_RUNS" e'
        . ' WHERE e."SEED" = :seed AND e."REVIEW" IS NULL AND ' . SITE_ENDURANCE_BEFORE
    );
    $statement->execute([
        'seed' => $seed,
        'distance' => $distance,
        'sameDistance' => $distance,
        'time' => $time,
    ]);

    return (int) $statement->fetchColumn() + 1;
}

/**
 * Keeps an endurance run as the run of its account on its track, in place of the one before.
 *
 * @param string|null $review Why the run waits for an admin, null when it ranks.
 * @return int Id of the run.
 */
function site_save_endurance_run(
    PDO $db,
    int $userId,
    int $seed,
    string $ghostString,
    int $distance,
    int $time,
    ?string $review
): int {
    return site_transaction($db, function () use (
        $db,
        $userId,
        $seed,
        $ghostString,
        $distance,
        $time,
        $review
    ) {
        $params = ['seed' => $seed, 'userId' => $userId];
        $db->prepare(
            'DELETE FROM "LOCAL_ENDURANCE_RUNS" WHERE "SEED" = :seed AND "USERID" = :userId'
        )->execute($params);
        $statement = $db->prepare(
            'INSERT INTO "LOCAL_ENDURANCE_RUNS"'
            . ' ("SEED", "USERID", "GHOSTSTRING", "DISTANCE", "TIME", "REVIEW")'
            . ' VALUES (:seed, :userId, :ghostString, :distance, :time, :review) RETURNING "ID"'
        );
        $statement->execute($params + [
            'ghostString' => $ghostString,
            'distance' => $distance,
            'time' => $time,
            'review' => $review,
        ]);
        $runId = (int) $statement->fetchColumn();
        $statement->closeCursor();

        return $runId;
    });
}

/**
 * The ghost string of an endurance run: a ranked run, a run of the account, or any run for the
 * admins; null for the others.
 */
function site_find_endurance_ghost(PDO $db, int $runId, ?int $userId, bool $admin): ?string
{
    $statement = $db->prepare(
        'SELECT "GHOSTSTRING" FROM "LOCAL_ENDURANCE_RUNS" WHERE "ID" = :id'
        . ($admin ? '' : ' AND ("REVIEW" IS NULL OR "USERID" = :userId)')
    );
    $statement->execute(['id' => $runId] + ($admin ? [] : ['userId' => $userId ?? 0]));
    $ghostString = $statement->fetchColumn();

    return $ghostString === false ? null : (string) $ghostString;
}

/**
 * The endurance runs waiting for an admin, oldest first, with their account (`RIDER`).
 *
 * @param int|null $seed Track of the runs, null for every track.
 * @return array[]
 */
function site_find_endurance_reviews(PDO $db, ?int $seed = null): array
{
    $statement = $db->prepare(
        'SELECT e."ID", e."SEED", e."DISTANCE", e."TIME", e."REVIEW", u."NAME" AS "RIDER"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."REVIEW" IS NOT NULL' . ($seed === null ? '' : ' AND e."SEED" = :seed')
        . ' ORDER BY e."ID"'
    );
    $statement->execute($seed === null ? [] : ['seed' => $seed]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Approves an endurance run waiting for an admin, ranking it. */
function site_approve_endurance_run(PDO $db, int $runId): void
{
    $db->prepare('UPDATE "LOCAL_ENDURANCE_RUNS" SET "REVIEW" = NULL WHERE "ID" = :id')
        ->execute(['id' => $runId]);
}

/** Deletes an endurance run, e.g. rejected by an admin. */
function site_delete_endurance_run(PDO $db, int $runId): void
{
    $db->prepare('DELETE FROM "LOCAL_ENDURANCE_RUNS" WHERE "ID" = :id')->execute(['id' => $runId]);
}
