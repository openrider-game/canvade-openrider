<?php

/**
 * Returns a published track.
 *
 * POST `id`, answers with the bytes of its track file (`application/octet-stream`, see
 * `api.php`), or 404 for an unknown track.
 */

require_once __DIR__ . '/../api.php';

openrider_handle(function (PDO $db) {
    $id = openrider_int_param('id');

    $statement = $db->prepare('SELECT "CODE" FROM "TRACKS" WHERE "ID" = :id');
    $statement->execute(['id' => $id]);
    $track = openrider_fetch_one($statement, 'Track does not exist');

    openrider_respond_code((string) openrider_bytes($track['CODE']));
});
