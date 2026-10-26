<?php

/**
 * Queries of the list of the ghosts of every track, on the ghosts page: the ghosts out of
 * review, the newest or the most liked first. The queries of the ghosts of a track or an account
 * are in tracks.php.
 */

/**
 * The ghosts out of review, a page of them, the newest first, with the title of their track
 * (`TITLE`, null without one), their account (`USERID` and `RIDER`, null for the ghosts saved
 * without the site), their rank on their track (`RANK`) and their number of thumbs up
 * (`THUMBS`).
 *
 * @param bool $mostLiked Whether the ghosts with the most thumbs up come first, the newest first
 *                        for the same number.
 * @return array[]
 */
function site_find_ghost_list(PDO $db, bool $mostLiked, int $offset, int $limit): array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TRACKID", g."GHOSTSTRING", g."TIME", d."TITLE", o."USERID",'
        . ' u."NAME" AS "RIDER",'
        . ' (SELECT COUNT(*) FROM "GHOSTS" f WHERE f."TRACKID" = g."TRACKID"'
        . ' AND f."ID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")'
        . ' AND (f."TIME" < g."TIME" OR (f."TIME" = g."TIME" AND f."ID" < g."ID"))) + 1 AS "RANK",'
        . ' ' . site_thumbs_column('ghost', 'g."ID"')
        . ' FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' WHERE ' . SITE_REVIEWED_GHOST
        . ' ORDER BY ' . ($mostLiked ? '"THUMBS" DESC, ' : '') . 'g."ID" DESC'
        . ' LIMIT ' . $limit . ' OFFSET ' . $offset
    );
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Number of ghosts out of review, listed by site_find_ghost_list(). */
function site_count_ghost_list(PDO $db): int
{
    return (int) $db->query('SELECT COUNT(*) FROM "GHOSTS" g WHERE ' . SITE_REVIEWED_GHOST)
        ->fetchColumn();
}
