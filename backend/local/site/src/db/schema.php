<?php

/**
 * Tables of the sample website and the connection to the database, the queries being in the
 * other files of `db/`, by domain.
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
 * - `LOCAL_ENDURANCE_RUNS`: the best endurance run of each account on each track of the day, a
 *   seed on a version of the generator of the game,
 *   ranked on the endurance page.
 *
 * The tracks and ghosts uploaded without the site, or before the accounts, have no account.
 */

require_once __DIR__ . '/../../../../db/api.php';

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
        . "\"ID\" $id, \"SEED\" BIGINT NOT NULL, \"VERSION\" INTEGER NOT NULL DEFAULT 1,"
        . ' "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "GHOSTSTRING" TEXT NOT NULL, "DISTANCE" INTEGER NOT NULL, "TIME" INTEGER NOT NULL,'
        . ' "REVIEW" TEXT)'
    );
    // Added with the versions of the generator: the runs saved before them are on the first one.
    // A track is a seed on a version, each account keeping one run on each
    site_add_column($db, 'LOCAL_ENDURANCE_RUNS', 'VERSION', 'INTEGER NOT NULL DEFAULT 1');
    $db->exec('DROP INDEX IF EXISTS idx_local_endurance_runs_user');
    $db->exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_local_endurance_runs_track_user'
        . ' ON "LOCAL_ENDURANCE_RUNS" ("SEED", "VERSION", "USERID")'
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
