<?php

/**
 * Returns a ghost of a track.
 *
 * POST `trackId` and `id`, answers `{"GHOSTSTRING": string}`, or 404 for an unknown ghost.
 */

require_once __DIR__ . '/../api.php';

openrider_handle(function (PDO $db) {
    $trackId = openrider_int_param('trackId');
    $id = openrider_int_param('id');

    $statement = $db->prepare(
        'SELECT "GHOSTSTRING" FROM "GHOSTS" WHERE "TRACKID" = :trackId AND "ID" = :id'
    );
    $statement->execute(['trackId' => $trackId, 'id' => $id]);

    return openrider_fetch_one($statement, 'Ghost does not exist');
});
