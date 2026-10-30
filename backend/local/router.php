<?php

/**
 * Router of the PHP built-in server, to run the whole game locally on SQLite:
 *
 *     php -S localhost:8000 backend/local/router.php
 *
 * Unless `OPENRIDER_DB_DSN` is set, the endpoints use `backend/local/openrider.db`, created with
 * the tables and the sample tracks and ghosts of `sample.sql` on the first request. Deleting the
 * file resets the database.
 *
 * The sample website of `site/` answers its routes (`/`, `/tracks/<id>/`, `/users/<name>/`, the
 * account forms, `/create/`, `/uploads/<id>/`, `/drafts/` and `/assets/`, see site/app.php), the
 * game alone staying at `/index.html`. The other requests are served as files, except the ones
 * refused by the Apache rules of the deployed site, `.htaccess` at the root of the project.
 */

/** Creates the SQLite database with the tables and the sample data when it does not exist. */
function openrider_local_db(string $file): void
{
    if (file_exists($file)) {
        return;
    }

    try {
        $db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec(file_get_contents(__DIR__ . '/../db/tables.sqlite.sql'));
        $db->exec(file_get_contents(__DIR__ . '/sample.sql'));
    } catch (Throwable $error) {
        // A half-created database would be reused on the next request
        $db = null;
        @unlink($file);
        throw $error;
    }
}

if (getenv('OPENRIDER_DB_DSN') === false) {
    $file = __DIR__ . '/openrider.db';
    openrider_local_db($file);
    putenv('OPENRIDER_DB_DSN=sqlite:' . $file);
}

// The session server of `npm run live:dev`, with the secret it takes with --dev
if (getenv('OPENRIDER_LIVE_SECRET') === false) {
    putenv('OPENRIDER_LIVE_SECRET=openrider-local-live-secret');
}
if (getenv('OPENRIDER_LIVE_URL') === false) {
    putenv('OPENRIDER_LIVE_URL=ws://127.0.0.1:8090/');
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Pages and assets of the sample website, see site/app.php
require __DIR__ . '/site/app.php';
if (site_handle($path)) {
    return true;
}

// Refused as by the Apache rules: the sources of the site and the database, the shared helpers
// of the endpoints, the migration script, the uploads bypassing the accounts of the site, and
// the files of the project
if (
    strpos($path, '/backend/local/') === 0
    || $path === '/backend/db/api.php'
    || $path === '/backend/migrate-tracks.php'
    || preg_match('#^/backend/db/(trackupload|ghostupload)/#', $path)
    || preg_match('#^/(src|test|node_modules)/|^/\.|\.(md|sql|db|json|ts|mjs|cjs|map)$#', $path)
) {
    http_response_code(403);
    return true;
}

// The other endpoints, by the index of their folder
if (preg_match('#^/backend/db/([a-z]+)/$#', $path, $match)) {
    $endpoint = __DIR__ . '/../db/' . $match[1] . '/index.php';
    if (is_file($endpoint)) {
        require $endpoint;
        return true;
    }
}

// The files of the project are served as they are. The built-in server would answer the other
// paths with the index.html of the root, the game: the site answers them with its 404 page
if (is_file($_SERVER['DOCUMENT_ROOT'] . $path)) {
    return false;
}
site_start_session();
site_not_found();
return true;
