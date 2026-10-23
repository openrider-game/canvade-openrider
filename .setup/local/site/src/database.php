<?php

/**
 * Queries of the sample website.
 *
 * The site reads the tables of the backend, and the titles of the tracks from its own
 * `LOCAL_TRACK_TITLES` table, the backend storing none.
 */

require_once __DIR__ . '/../../../db/api.php';

/** Connects to the backend database, creating the titles table of databases older than it. */
function site_db(): PDO
{
    $db = openrider_db();
    $db->exec(
        'CREATE TABLE IF NOT EXISTS "LOCAL_TRACK_TITLES" ('
        . '"TRACKID" INTEGER PRIMARY KEY REFERENCES "TRACKS" ("ID"), "TITLE" TEXT NOT NULL)'
    );

    return $db;
}

/**
 * The published tracks, newest first, with their title, number of ghosts (`GHOSTS`) and best
 * time (`BEST`, null without ghost).
 *
 * @return array[]
 */
function site_find_tracks(PDO $db): array
{
    return $db->query(
        'SELECT t."ID", t."CODE", t."THUMBNAIL", l."TITLE",'
        . ' COUNT(g."ID") AS "GHOSTS", MIN(g."TIME") AS "BEST"'
        . ' FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_TITLES" l ON l."TRACKID" = t."ID"'
        . ' LEFT JOIN "GHOSTS" g ON g."TRACKID" = t."ID"'
        . ' GROUP BY t."ID", t."CODE", t."THUMBNAIL", l."TITLE"'
        . ' ORDER BY t."ID" DESC'
    )->fetchAll(PDO::FETCH_ASSOC);
}

/** A published track with its title, or null when it does not exist. */
function site_find_track(PDO $db, int $trackId): ?array
{
    $statement = $db->prepare(
        'SELECT t."ID", t."CODE", l."TITLE" FROM "TRACKS" t'
        . ' LEFT JOIN "LOCAL_TRACK_TITLES" l ON l."TRACKID" = t."ID"'
        . ' WHERE t."ID" = :id'
    );
    $statement->execute(['id' => $trackId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * The ghosts of a track, fastest first.
 *
 * @return array[]
 */
function site_find_ghosts(PDO $db, int $trackId): array
{
    $statement = $db->prepare(
        'SELECT "ID", "GHOSTSTRING", "TIME" FROM "GHOSTS"'
        . ' WHERE "TRACKID" = :id ORDER BY "TIME", "ID"'
    );
    $statement->execute(['id' => $trackId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}
