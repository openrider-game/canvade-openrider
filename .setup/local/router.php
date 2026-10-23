<?php

/**
 * Router of the PHP built-in server, to run the whole game locally on SQLite:
 *
 *     php -S localhost:8000 .setup/local/router.php
 *
 * Unless `OPENRIDER_DB_DSN` is set, the endpoints use `.setup/local/openrider.db`, created with
 * the tables and the sample tracks and ghosts of `sample.sql` on the first request. Deleting the
 * file resets the database.
 *
 * The sample website of `site/` answers its routes (`/`, `/tracks/<id>/`, `/create/` and
 * `/assets/`), the game alone staying at `/index.html`. The other requests are served as files.
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

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Pages and assets of the sample website, see site/app.php
require __DIR__ . '/site/app.php';
if (site_handle($path)) {
    return true;
}

// Neither the shared helpers of the endpoints nor the database are served
if ($path === '/.setup/db/api.php' || strpos($path, '/.setup/local/') === 0) {
    http_response_code(403);
    return true;
}

// The built-in server does not resolve the index of directories under a dot folder like .setup
if (preg_match('#^/\.setup/db/([a-z]+)/$#', $path, $match)) {
    $endpoint = __DIR__ . '/../db/' . $match[1] . '/index.php';
    if (is_file($endpoint)) {
        require $endpoint;
        return true;
    }
}

return false;
