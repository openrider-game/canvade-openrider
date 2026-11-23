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
 * - `LOCAL_THUMBS`: the thumbs up of the accounts on the tracks and the ghosts;
 * - `LOCAL_RATE_EVENTS`: the recent actions counted by the rate limits, see security.php;
 * - `LOCAL_ENDURANCE_RUNS`: the best endurance run of each account on each track of the day, a
 *   seed on a version of the generator of the game,
 *   ranked on the endurance page;
 * - `LOCAL_TEMPLATES`: the objects saved by the accounts from the editor, private or public, to
 *   paste in their tracks (see db/templates.php);
 * - `LOCAL_COMMENTS`: the comments of the accounts on the tracks, and their replies (see
 *   db/comments.php);
 * - `LOCAL_AUDIT`: what the moderators and the admins did, e.g. the roles given and the content
 *   of the others deleted (see db/audit.php);
 * - `LOCAL_USER_SETTINGS`: the preferences of each account, e.g. its theme and the keys of the
 *   game (see db/settings.php);
 * - `LOCAL_FORUM_CATEGORIES`, `LOCAL_FORUM_TOPICS`, `LOCAL_FORUM_POSTS`, `LOCAL_FORUM_EDITS` and
 *   `LOCAL_FORUM_REPORTS`: the forum, its posts, their previous versions and their reports (see
 *   db/forum.php), `LOCAL_FORUM_READS` and `LOCAL_FORUM_WATCHES`: what each account read of it
 *   and the topics it follows;
 * - `LOCAL_NOTIFICATIONS`: the replies and comments each account is told of (see
 *   db/notifications.php);
 * - `LOCAL_TRACK_VISITS`: when each account first opened the page of each track, and
 *   `LOCAL_GHOST_REPORTS`: the ghosts the accounts reported to the admins (see db/insights.php).
 *
 * The tracks and ghosts uploaded to the backend without the site have no account.
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
    // SQLite and PostgreSQL do not share a syntax for auto-incremented ids, nor a binary type
    $pgsql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql';
    $id = $pgsql ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $bytes = $pgsql ? 'BYTEA' : 'BLOB';

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
        . "\"ID\" $id, \"CODE\" $bytes NOT NULL, \"THUMBNAIL\" TEXT,"
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

    // The thumbs up of the accounts, one per account on each track or ghost
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_THUMBS" ('
        . '"KIND" TEXT NOT NULL, "SUBJECTID" INTEGER NOT NULL,'
        . ' "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' PRIMARY KEY ("KIND", "SUBJECTID", "USERID"))'
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
    // The columns below are added to the tables of an existing database missing them, see
    // site_add_column(). Version of the generator of each run, 1 by default: a track is a seed on
    // a version, each account keeping one run on each, so an index on the seed and the account
    // alone is dropped
    site_add_column($db, 'LOCAL_ENDURANCE_RUNS', 'VERSION', 'INTEGER NOT NULL DEFAULT 1');
    $db->exec('DROP INDEX IF EXISTS idx_local_endurance_runs_user');
    $db->exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_local_endurance_runs_track_user'
        . ' ON "LOCAL_ENDURANCE_RUNS" ("SEED", "VERSION", "USERID")'
    );

    // Account of each track and upload, null for those uploaded to the backend without the site
    $userColumn = 'INTEGER REFERENCES "LOCAL_USERS" ("ID")';
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'USERID', $userColumn);
    site_add_column($db, 'LOCAL_UPLOADS', 'USERID', $userColumn);

    // Verifier and verifying run of each published track, null for a track without one, which is
    // unverified. Not a reference: a track stays verified when its verifier deletes their account
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'VERIFIERID', 'INTEGER');
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'VERIFICATIONGHOSTID', 'INTEGER');
    // The verifier of a track code waiting for verification, then the verifying run, and why it
    // waits for an admin, null when it does not
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFIERID', $userColumn);
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFICATIONGHOST', 'TEXT');
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFICATIONTIME', 'INTEGER');

    // The other accounts that edited a track with its author, their ids separated with commas,
    // empty for a track of its author alone; then why an upload waits for an admin
    site_add_column($db, 'LOCAL_UPLOADS', 'COLLABORATORS', "TEXT NOT NULL DEFAULT ''");
    site_add_column($db, 'LOCAL_TRACK_DETAILS', 'COLLABORATORS', "TEXT NOT NULL DEFAULT ''");
    site_add_column($db, 'LOCAL_UPLOADS', 'REVIEW', 'TEXT');

    // The templates of the accounts, public ones seen by everyone (1), their creation as a Unix
    // timestamp, and their thumbnail as base64 PNG data, null without one
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_TEMPLATES" ('
        . "\"ID\" $id, \"USERID\" INTEGER NOT NULL REFERENCES \"LOCAL_USERS\" (\"ID\"),"
        . " \"NAME\" TEXT NOT NULL, \"CODE\" $bytes NOT NULL, \"OBJECTS\" INTEGER NOT NULL,"
        . ' "PUBLIC" INTEGER NOT NULL DEFAULT 0, "CREATED" INTEGER NOT NULL, "THUMBNAIL" TEXT)'
    );
    site_add_column($db, 'LOCAL_TEMPLATES', 'THUMBNAIL', 'TEXT');

    // The comments on the tracks: a reply has the comment it answers as parent, null for the
    // comments themselves; the account is null once deleted, the text then empty
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_COMMENTS" ('
        . "\"ID\" $id, \"TRACKID\" INTEGER NOT NULL,"
        . ' "USERID" INTEGER REFERENCES "LOCAL_USERS" ("ID"), "PARENTID" INTEGER,'
        . ' "TEXT" TEXT NOT NULL, "CREATED" INTEGER NOT NULL)'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_comments_track'
        . ' ON "LOCAL_COMMENTS" ("TRACKID", "PARENTID", "ID")'
    );

    // What the admins see of the runs besides their inputs (see db/insights.php), null for the
    // accounts and runs from before: when the accounts were created and the ghosts saved, as Unix
    // timestamps, and the seconds the riders spent on the track before saving their runs,
    // measured by the server
    site_add_column($db, 'LOCAL_USERS', 'CREATED', 'INTEGER');
    // The role of each account (see site_role()), and its suspension: until a Unix timestamp, 0
    // for good, null without one, with the reason told to the account
    site_add_column($db, 'LOCAL_USERS', 'ROLE', "TEXT NOT NULL DEFAULT 'user'");
    site_add_column($db, 'LOCAL_USERS', 'SUSPENDEDUNTIL', 'INTEGER');
    site_add_column($db, 'LOCAL_USERS', 'SUSPENSIONREASON', 'TEXT');
    // Raised to log the other sessions of an account out, e.g. on a password change: a session
    // keeps the version it logged in with (see site_user())
    site_add_column($db, 'LOCAL_USERS', 'SESSIONVERSION', 'INTEGER NOT NULL DEFAULT 0');
    // The e-mail address an account may give, never shown: whether it wants the digests, and
    // whether its Gravatar shows next to its posts (see site_avatar_url())
    site_add_column($db, 'LOCAL_USERS', 'EMAIL', 'TEXT');
    site_add_column($db, 'LOCAL_USERS', 'EMAILDIGEST', 'INTEGER NOT NULL DEFAULT 0');
    site_add_column($db, 'LOCAL_USERS', 'GRAVATAR', 'INTEGER NOT NULL DEFAULT 0');
    site_create_forum_tables($db, $id);
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_USER_SETTINGS" ('
        . '"USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "NAME" TEXT NOT NULL, "VALUE" TEXT NOT NULL, "UPDATED" INTEGER NOT NULL,'
        . ' PRIMARY KEY ("USERID", "NAME"))'
    );
    // What the moderators and the admins did: the name of the account acting is kept, as the
    // account may be deleted since
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_AUDIT" ('
        . "\"ID\" $id, \"CREATED\" INTEGER NOT NULL, \"ACTORID\" INTEGER,"
        . ' "ACTORNAME" TEXT NOT NULL, "ACTION" TEXT NOT NULL, "TARGET" TEXT NOT NULL,'
        . ' "DETAILS" TEXT NOT NULL)'
    );
    site_add_column($db, 'LOCAL_GHOST_OWNERS', 'CREATED', 'INTEGER');
    site_add_column($db, 'LOCAL_GHOST_OWNERS', 'TRACKSECONDS', 'INTEGER');
    site_add_column($db, 'LOCAL_UPLOADS', 'VERIFICATIONSECONDS', 'INTEGER');
    site_add_column($db, 'LOCAL_ENDURANCE_RUNS', 'TRACKSECONDS', 'INTEGER');
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_TRACK_VISITS" ('
        . '"USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "TRACKID" INTEGER NOT NULL, "FIRSTOPENED" INTEGER NOT NULL,'
        . ' PRIMARY KEY ("USERID", "TRACKID"))'
    );
    // One report per account on each ghost, with its reason and time
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_GHOST_REPORTS" ('
        . '"GHOSTID" INTEGER NOT NULL REFERENCES "GHOSTS" ("ID"),'
        . ' "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "REASON" TEXT NOT NULL, "CREATED" INTEGER NOT NULL,'
        . ' PRIMARY KEY ("GHOSTID", "USERID"))'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_templates_user ON "LOCAL_TEMPLATES" ("USERID")'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_templates_public ON "LOCAL_TEMPLATES" ("PUBLIC", "ID")'
    );
}

/** Adds a column missing from a table of an existing database, keeping its rows. */
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

/**
 * Creates the tables of the forum, and its first categories when it has none (see
 * SITE_FORUM_DEFAULT_CATEGORIES).
 *
 * @param string $id Definition of an id column of the database.
 */
function site_create_forum_tables(PDO $db, string $id): void
{
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_CATEGORIES" ('
        . "\"ID\" $id, \"SLUG\" TEXT NOT NULL UNIQUE, \"NAME\" TEXT NOT NULL,"
        . ' "DESCRIPTION" TEXT NOT NULL, "POSITION" INTEGER NOT NULL,'
        . ' "STAFFONLY" INTEGER NOT NULL DEFAULT 0)'
    );
    // The number of posts and the last one are kept on the topic, for the lists
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_TOPICS" ('
        . "\"ID\" $id, \"CATEGORYID\" INTEGER NOT NULL REFERENCES \"LOCAL_FORUM_CATEGORIES\" (\"ID\"),"
        . ' "USERID" INTEGER REFERENCES "LOCAL_USERS" ("ID"), "TITLE" TEXT NOT NULL,'
        . ' "CREATED" INTEGER NOT NULL, "LASTPOSTAT" INTEGER NOT NULL, "LASTPOSTID" INTEGER,'
        . ' "POSTS" INTEGER NOT NULL DEFAULT 0, "PINNED" INTEGER NOT NULL DEFAULT 0,'
        . ' "LOCKED" INTEGER NOT NULL DEFAULT 0)'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_POSTS" ('
        . "\"ID\" $id, \"TOPICID\" INTEGER NOT NULL REFERENCES \"LOCAL_FORUM_TOPICS\" (\"ID\"),"
        . ' "USERID" INTEGER REFERENCES "LOCAL_USERS" ("ID"), "TEXT" TEXT NOT NULL,'
        . ' "CREATED" INTEGER NOT NULL, "EDITED" INTEGER)'
    );
    // The previous versions of the posts edited, read by the moderators
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_EDITS" ('
        . "\"ID\" $id, \"POSTID\" INTEGER NOT NULL, \"USERID\" INTEGER,"
        . ' "TEXT" TEXT NOT NULL, "CREATED" INTEGER NOT NULL)'
    );
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_REPORTS" ('
        . '"POSTID" INTEGER NOT NULL, "USERID" INTEGER NOT NULL REFERENCES "LOCAL_USERS" ("ID"),'
        . ' "REASON" TEXT NOT NULL, "CREATED" INTEGER NOT NULL, PRIMARY KEY ("POSTID", "USERID"))'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_forum_topics_category'
        . ' ON "LOCAL_FORUM_TOPICS" ("CATEGORYID", "PINNED", "LASTPOSTAT")'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_forum_posts_topic ON "LOCAL_FORUM_POSTS" ("TOPICID", "ID")'
    );
    $db->exec('CREATE INDEX IF NOT EXISTS idx_local_forum_edits_post ON "LOCAL_FORUM_EDITS" ("POSTID")');

    // What each account read: the last post read of each topic opened, and the time it marked the
    // whole forum read, the older posts being read (see site_forum_read_since())
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_READS" ('
        . '"USERID" INTEGER NOT NULL, "TOPICID" INTEGER NOT NULL, "POSTID" INTEGER NOT NULL,'
        . ' PRIMARY KEY ("USERID", "TOPICID"))'
    );
    site_add_column($db, 'LOCAL_USERS', 'FORUMREADAT', 'INTEGER');
    // The topics each account follows (1), told of their replies, or stopped following (0): its
    // choice is kept, replying again not following them again
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_FORUM_WATCHES" ('
        . '"USERID" INTEGER NOT NULL, "TOPICID" INTEGER NOT NULL, "WATCHING" INTEGER NOT NULL,'
        . ' PRIMARY KEY ("USERID", "TOPICID"))'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_forum_watches_topic ON "LOCAL_FORUM_WATCHES" ("TOPICID")'
    );

    // The notifications of the accounts (see db/notifications.php): what happened (`KIND`) to what
    // (`SUBJECTID`), from the first post or comment unseen (`TARGETID`), grouped while unread:
    // `COUNT` of them, by the account of the last one (`ACTORID`, null once deleted), at its time
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_NOTIFICATIONS" ('
        . "\"ID\" $id, \"USERID\" INTEGER NOT NULL, \"KIND\" TEXT NOT NULL,"
        . ' "SUBJECTID" INTEGER NOT NULL, "TARGETID" INTEGER NOT NULL, "ACTORID" INTEGER,'
        . ' "COUNT" INTEGER NOT NULL DEFAULT 1, "CREATED" INTEGER NOT NULL,'
        . ' "SEEN" INTEGER NOT NULL DEFAULT 0)'
    );
    $db->exec(
        'CREATE INDEX IF NOT EXISTS idx_local_notifications_user'
        . ' ON "LOCAL_NOTIFICATIONS" ("USERID", "SEEN", "ID")'
    );

    if ((int) $db->query('SELECT COUNT(*) FROM "LOCAL_FORUM_CATEGORIES"')->fetchColumn() === 0) {
        $insert = $db->prepare(
            'INSERT INTO "LOCAL_FORUM_CATEGORIES" ("SLUG", "NAME", "DESCRIPTION", "POSITION", "STAFFONLY")'
            . ' VALUES (:slug, :name, :description, :position, :staffOnly)'
        );
        foreach (SITE_FORUM_DEFAULT_CATEGORIES as $position => [$slug, $name, $description, $staffOnly]) {
            $insert->execute([
                'slug' => $slug,
                'name' => $name,
                'description' => $description,
                'position' => $position,
                'staffOnly' => (int) $staffOnly,
            ]);
        }
    }
}
