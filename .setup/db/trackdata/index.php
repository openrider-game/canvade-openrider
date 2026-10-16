<?php

/**
 * Returns the code and the thumbnail of a published track.
 *
 * POST `id`, answers `{"CODE": string, "THUMBNAIL": string|null}`, or 404 for an unknown track.
 */

require __DIR__ . '/../api.php';

openrider_handle(function (PDO $db) {
    $id = openrider_int_param('id');

    $statement = $db->prepare('SELECT "CODE", "THUMBNAIL" FROM "TRACKS" WHERE "ID" = :id');
    $statement->execute(['id' => $id]);

    return openrider_fetch_one($statement, 'Track does not exist');
});
