<?php

/**
 * Saves the ghost of a finished race.
 *
 * POST `ghostString`, `trackId` and `time` (in physics ticks), answers `{"ID": number}`, or 404
 * when the track does not exist.
 */

require __DIR__ . '/../api.php';

openrider_handle(function (PDO $db) {
    $ghostString = openrider_string_param('ghostString');
    $trackId = openrider_int_param('trackId');
    $time = openrider_int_param('time', 0);

    $track = $db->prepare('SELECT "ID" FROM "TRACKS" WHERE "ID" = :trackId');
    $track->execute(['trackId' => $trackId]);
    openrider_fetch_one($track, 'Track does not exist');

    $statement = $db->prepare(
        'INSERT INTO "GHOSTS" ("GHOSTSTRING", "TRACKID", "TIME")'
        . ' VALUES (:ghostString, :trackId, :time) RETURNING "ID"'
    );
    $statement->execute(['ghostString' => $ghostString, 'trackId' => $trackId, 'time' => $time]);

    return openrider_fetch_one($statement, 'Ghost not saved');
});
