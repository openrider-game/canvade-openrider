<?php

/**
 * Front controller of the sample website of the local backend.
 *
 * | Route           | Page                                                  |
 * | --------------- | ----------------------------------------------------- |
 * | `/`             | the published tracks                                  |
 * | `/tracks/<id>/` | the game racing a track, and the leaderboard under it |
 * | `/create/`      | the game editing a new track                          |
 * | `/assets/...`   | the static files of `public/`                         |
 */

require_once __DIR__ . '/src/database.php';
require_once __DIR__ . '/src/format.php';
require_once __DIR__ . '/src/view.php';

/** Folder of the static files, served under `/assets/`. */
const SITE_PUBLIC_DIR = __DIR__ . '/public';

/** Media types of the static files. */
const SITE_MEDIA_TYPES = [
    'css' => 'text/css; charset=UTF-8',
    'js' => 'text/javascript; charset=UTF-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
];

/**
 * Answers a request of the site.
 *
 * @param string $path Path of the request URL.
 * @return bool Whether the path is a route of the site, false to let the server handle it.
 */
function site_handle(string $path): bool
{
    if ($path === '/') {
        site_home_page();
    } elseif (preg_match('#^/tracks/([0-9]+)/?$#', $path, $match)) {
        site_track_page((int) $match[1]);
    } elseif ($path === '/create/') {
        site_render_page('editor', 'Create a track', [], ['game.css'], ['/dist/main.js']);
    } elseif (strpos($path, '/assets/') === 0) {
        site_serve_asset(substr($path, strlen('/assets/')));
    } else {
        return false;
    }

    return true;
}

/** The published tracks, newest first. */
function site_home_page(): void
{
    site_render_page('home', 'Tracks', ['tracks' => site_find_tracks(site_db())]);
}

/** A track raced by the game, with the leaderboard of its ghosts. */
function site_track_page(int $trackId): void
{
    $db = site_db();
    $track = site_find_track($db, $trackId);
    if ($track === null) {
        site_not_found();
        return;
    }

    site_render_page(
        'track',
        site_track_title($track),
        ['track' => $track, 'ghosts' => site_find_ghosts($db, $trackId)],
        ['game.css'],
        // The leaderboard drives the game through its page API, set up by the game script
        ['/dist/main.js', '/assets/js/leaderboard.js'],
    );
}

/** Answers 404 with the not found page. */
function site_not_found(): void
{
    http_response_code(404);
    site_render_page('not-found', 'Page not found');
}

/** Serves a file of `public/`, refusing the paths leading out of it. */
function site_serve_asset(string $relativePath): void
{
    $root = realpath(SITE_PUBLIC_DIR);
    $file = realpath(SITE_PUBLIC_DIR . '/' . $relativePath);
    $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));

    if (
        $file === false
        || strpos($file, $root . DIRECTORY_SEPARATOR) !== 0
        || !is_file($file)
        || !isset(SITE_MEDIA_TYPES[$extension])
    ) {
        site_not_found();
        return;
    }

    header('Content-Type: ' . SITE_MEDIA_TYPES[$extension]);
    header('Content-Length: ' . filesize($file));
    readfile($file);
}
