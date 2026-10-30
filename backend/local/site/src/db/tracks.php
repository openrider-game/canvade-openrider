<?php

/**
 * Queries of the published tracks and their ghosts, with their details and accounts, and of the
 * ghosts waiting for an admin.
 */

/** Condition on `GHOSTS g` keeping the ghosts not waiting for an admin. */
const SITE_REVIEWED_GHOST = 'g."ID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")';

/**
 * The published tracks, newest first, with their title (null for the tracks uploaded to the
 * backend without the site), author name (`AUTHOR`, null without account), verifier id
 * (`VERIFIERID`, null for an unverified track), number of ghosts (`GHOSTS`), best time (`BEST`,
 * null without ghost) and number of thumbs up (`THUMBS`). The ghosts waiting for an admin are
 * not counted.
 *
 * The tracks made with other accounts, in an editing session, give the names of these accounts
 * (`COAUTHORS`, see site_coauthors()).
 *
 * @param int|null $userId    Author or co-author of the tracks, null for every track.
 * @param bool     $mostLiked Whether the tracks with the most thumbs up come first, the newest
 *                            first for the same number.
 * @return array[]
 */
function site_find_tracks(PDO $db, ?int $userId = null, bool $mostLiked = false): array
{
    $statement = $db->prepare(
        'SELECT t."ID", ' . site_code_head('t."CODE"') . ' AS "CODEHEAD", t."THUMBNAIL",'
        . ' d."TITLE", d."VERIFIERID", d."COLLABORATORS",'
        . ' u."NAME" AS "AUTHOR", COUNT(g."ID") AS "GHOSTS", MIN(g."TIME") AS "BEST", '
        . site_thumbs_column('track', 't."ID"')
        . ' FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = d."USERID"'
        . ' LEFT JOIN "GHOSTS" g ON g."TRACKID" = t."ID" AND ' . SITE_REVIEWED_GHOST
        . ($userId === null ? '' : ' WHERE d."USERID" = :userId'
            . ' OR \',\' || d."COLLABORATORS" || \',\' LIKE :coauthor')
        . ' GROUP BY t."ID", ' . site_code_head('t."CODE"') . ', t."THUMBNAIL", d."TITLE",'
        . ' d."VERIFIERID", d."COLLABORATORS",'
        . ' u."NAME"'
        . ' ORDER BY ' . ($mostLiked ? '"THUMBS" DESC, ' : '') . 't."ID" DESC'
    );
    $statement->execute(
        $userId === null ? [] : ['userId' => $userId, 'coauthor' => "%,$userId,%"]
    );

    return array_map(
        fn (array $track) => ['CODEHEAD' => openrider_bytes($track['CODEHEAD'])] + $track
            + ['COAUTHORS' => site_coauthors($db, $track)],
        $statement->fetchAll(PDO::FETCH_ASSOC)
    );
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
        . ' d."COLLABORATORS",'
        . ' d."VERIFIERID", v."NAME" AS "VERIFIER", d."VERIFICATIONGHOSTID", '
        . site_thumbs_column('track', 't."ID"')
        . ' FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = d."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = d."VERIFIERID"'
        . ' WHERE t."ID" = :id'
    );
    $statement->execute(['id' => $trackId]);
    $track = $statement->fetch(PDO::FETCH_ASSOC);

    return $track
        ? ['CODE' => openrider_bytes($track['CODE'])] + $track
            + ['COAUTHORS' => site_coauthors($db, $track)]
        : null;
}

/**
 * Names of the other accounts that made a track with its author, in an editing session, by
 * name; the deleted ones left out. Empty for a track of its author alone.
 *
 * @param array $track Track with its `COLLABORATORS`.
 * @return string[]
 */
function site_coauthors(PDO $db, array $track): array
{
    $ids = array_map('intval', array_filter(explode(',', (string) ($track['COLLABORATORS'] ?? ''))));
    if (!$ids) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $db->prepare(
        "SELECT \"NAME\" FROM \"LOCAL_USERS\" WHERE \"ID\" IN ($placeholders) ORDER BY \"NAME\""
    );
    $statement->execute($ids);

    return $statement->fetchAll(PDO::FETCH_COLUMN);
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
        . ' r."REASONS" AS "REVIEW", ' . site_thumbs_column('ghost', 'g."ID"')
        . ' FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE g."TRACKID" = :id ORDER BY g."TIME", g."ID"'
    );
    $statement->execute(['id' => $trackId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * The ghost string of a ghost of a track: a ghost not waiting for an admin, a ghost of the
 * account, or any ghost for the admins; null for the others.
 */
function site_find_visible_ghost(
    PDO $db,
    int $trackId,
    int $ghostId,
    ?int $userId,
    bool $admin
): ?string {
    $statement = $db->prepare(
        'SELECT g."GHOSTSTRING", o."USERID", r."REASONS" FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE g."TRACKID" = :trackId AND g."ID" = :id'
    );
    $statement->execute(['trackId' => $trackId, 'id' => $ghostId]);
    $ghost = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$ghost) {
        return null;
    }

    $visible = $ghost['REASONS'] === null || $admin
        || ($userId !== null && (int) $ghost['USERID'] === $userId);
    return $visible ? (string) $ghost['GHOSTSTRING'] : null;
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
        . ' AND (f."TIME" < g."TIME" OR (f."TIME" = g."TIME" AND f."ID" < g."ID"))) + 1 AS "RANK",'
        . ' ' . site_thumbs_column('ghost', 'g."ID"')
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

/** A ghost with its track (`TRACKID`) and account (`USERID`, null without), or null. */
function site_find_ghost(PDO $db, int $ghostId): ?array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TRACKID", o."USERID", r."REASONS" AS "REVIEW" FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE g."ID" = :id'
    );
    $statement->execute(['id' => $ghostId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}
