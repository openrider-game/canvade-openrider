<?php

/**
 * Deletions of the tracks, ghosts, uploads and accounts, with the rows of the site referencing
 * them.
 */

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
        // The thumbs up it gave
        $db->prepare('DELETE FROM "LOCAL_THUMBS" WHERE "USERID" = :userId')->execute($params);
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
        site_delete_thumbs($db, 'ghost', (int) $ghostId);
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
        site_delete_thumbs($db, 'track', (int) $trackId);
        $details->execute($params);
        $tracks->execute($params);
    }
}
