<?php

/**
 * Publishes a track.
 *
 * POST `trackCode`, and `thumbnail` (a base64 PNG, optional), answers `{"ID": number}`.
 */

require_once __DIR__ . '/../api.php';

openrider_handle(function (PDO $db) {
    $trackCode = openrider_string_param('trackCode');
    $thumbnail = openrider_string_param('thumbnail', false);
    if (!preg_match('/^[A-Za-z0-9+\/]*={0,2}$/', $thumbnail)) {
        openrider_reject('Invalid parameter: thumbnail');
    }

    $statement = $db->prepare(
        'INSERT INTO "TRACKS" ("CODE", "THUMBNAIL") VALUES (:trackCode, :thumbnail) RETURNING "ID"'
    );
    $statement->execute([
        'trackCode' => $trackCode,
        'thumbnail' => $thumbnail === '' ? null : $thumbnail,
    ]);

    return openrider_fetch_one($statement, 'Track not saved');
});
