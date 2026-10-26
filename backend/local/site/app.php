<?php

/**
 * Front controller of the sample website: run by `router.php` with the PHP built-in server, and
 * by `backend/site.php` with Apache.
 *
 * | Route                                | Page                                                  |
 * | ------------------------------------ | ----------------------------------------------------- |
 * | `/`                                  | the published tracks                                  |
 * | `/tracks/<id>/`                      | the game racing a track, and the leaderboard under it |
 * | `/users/`                            | the accounts, searched by name                        |
 * | `/users/<name>/`                     | the tracks and ghosts of an account                   |
 * | `/register/`, `/login/`, `/logout/`  | the account forms                                     |
 * | `/create/`                           | the game editing a new track                          |
 * | `/uploads/<id>/`                     | the form sending an upload to verification, or a draft |
 * | `/uploads/<id>/track.openrider.json` | the editor file of a draft, to download               |
 * | `/drafts/`                           | the drafts of the account, and the tracks to verify   |
 * | `/drafts/<id>/`                      | the game editing a draft                              |
 * | `/verify/<id>/`                      | the game racing a track waiting for verification      |
 * | `/verify/<id>/<verifier, decline, publish>/` | changing its verification, posted             |
 * | `/reviews/`                          | the ghosts and verifications waiting for an admin     |
 * | `/<tracks, ghosts, drafts, users>/<id or name>/delete/` | deleting it, posted        |
 * | `/assets/...`                        | the static files of `public/`                         |
 *
 * Racing and browsing are open to everyone; creating tracks, saving drafts and ghosts need an
 * account, and the drafts and uploads are only seen by their own account. An account deletes
 * what it made, and the admins anything, see site_can_delete().
 *
 * A track code is published once verified, as in Geometry Dash: its author, or the account it
 * names, finishes it on its verification page, then its author publishes it. The ghosts and the
 * verifying runs whose inputs look suspicious wait for an admin (see site_analyse_ghost()).
 *
 * The game has the page as base URL, `/tracks/<id>/`, `/create/`, `/drafts/<id>/` or
 * `/verify/<id>/`: the site answers there the uploads of tracks and ghosts in place of the
 * backend, to know their account and check them, and the download of a draft or of a track
 * waiting for verification, and serves the other backend endpoints and the icons, see
 * site_game_request().
 *
 * The posted requests coming from another site are refused, see site_check_origin().
 *
 * The pages and endpoints answering the routes are in `src/controllers/`, by feature.
 */

require_once __DIR__ . '/src/auth.php';
require_once __DIR__ . '/src/database.php';
require_once __DIR__ . '/src/format.php';
require_once __DIR__ . '/src/http.php';
require_once __DIR__ . '/src/live.php';
require_once __DIR__ . '/src/security.php';
require_once __DIR__ . '/src/view.php';
require_once __DIR__ . '/src/controllers/account.php';
require_once __DIR__ . '/src/controllers/editor.php';
require_once __DIR__ . '/src/controllers/endurance.php';
require_once __DIR__ . '/src/controllers/ghosts.php';
require_once __DIR__ . '/src/controllers/reviews.php';
require_once __DIR__ . '/src/controllers/thumbs.php';
require_once __DIR__ . '/src/controllers/tracks.php';
require_once __DIR__ . '/src/controllers/users.php';
require_once __DIR__ . '/src/controllers/verification.php';

/** Folder of the static files, served under `/assets/`. */
const SITE_PUBLIC_DIR = __DIR__ . '/public';

/** Folders of the game: its icons, and its backend endpoints. */
const SITE_GAME_MEDIA_DIR = __DIR__ . '/../../../media',
    SITE_GAME_ENDPOINTS_DIR = __DIR__ . '/../../db';

/**
 * Requests of the game under the URL of its page: the endpoints of the backend and the icons.
 * Captures the page (`create`, `endurance`, `drafts/<id>`, `tracks/<id>` or `verify/<id>`) and the
 * requested path.
 */
const SITE_GAME_REQUEST_PATTERN =
    '#^/(create|endurance|(?:drafts|tracks|verify)/[0-9]+)/(backend/db/[a-z]+/|media/.+)$#';

/**
 * Actions of the admins on a ghost, a verifying run or an endurance run: its kind, id and the
 * action.
 */
const SITE_REVIEW_ACTION_PATTERN = '#^/reviews/(ghosts|tracks|runs)/([0-9]+)/(approve|reject)/$#';

/**
 * Answers a request of the site.
 *
 * @param string $path Path of the request URL.
 * @return bool Whether the path is a route of the site, false to let the server handle it.
 */
function site_handle(string $path): bool
{
    $posted = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
    if ($posted && !site_check_origin()) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Posted from another site';
        return true;
    }

    if (strpos($path, '/assets/') === 0) {
        site_serve_file(SITE_PUBLIC_DIR, substr($path, strlen('/assets/')));
        return true;
    }
    if (preg_match(SITE_GAME_REQUEST_PATTERN, $path, $match)) {
        site_game_request($match[1], $match[2]);
        return true;
    }

    // Started before any output, the pages showing the account in their header
    site_start_session();

    if ($path === '/') {
        site_home_page();
    } elseif (preg_match('#^/tracks/([0-9]+)/?$#', $path, $match)) {
        site_track_page((int) $match[1]);
    } elseif ($path === '/ghosts/') {
        site_ghosts_page();
    } elseif ($path === '/users/') {
        site_users_page();
    } elseif (preg_match('#^/users/([^/]+)/?$#', $path, $match)) {
        site_user_page(rawurldecode($match[1]));
    } elseif ($path === '/register/' || $path === '/login/') {
        site_account_page(trim($path, '/'));
    } elseif ($path === '/logout/') {
        site_logout();
    } elseif ($path === '/create/') {
        site_create_page();
    } elseif ($path === '/endurance/') {
        site_endurance_page();
    } elseif (preg_match('#^/uploads/([0-9]+)/?$#', $path, $match)) {
        site_upload_page((int) $match[1]);
    } elseif (preg_match('#^/uploads/([0-9]+)/track\.openrider\.json$#', $path, $match)) {
        site_editor_file((int) $match[1]);
    } elseif ($path === '/drafts/') {
        site_drafts_page();
    } elseif (preg_match('#^/drafts/([0-9]+)/?$#', $path, $match)) {
        site_draft_page((int) $match[1]);
    } elseif (preg_match('#^/(tracks|ghosts)/([0-9]+)/thumb/$#', $path, $match)) {
        site_thumb($match[1], (int) $match[2]);
    } elseif (preg_match('#^/(tracks|ghosts|drafts|users)/([^/]+)/delete/$#', $path, $match)) {
        site_delete($match[1], rawurldecode($match[2]));
    } elseif (preg_match('#^/verify/([0-9]+)/?$#', $path, $match)) {
        site_verify_page((int) $match[1]);
    } elseif (preg_match('#^/verify/([0-9]+)/status/$#', $path, $match)) {
        site_verify_status((int) $match[1]);
    } elseif (preg_match('#^/verify/([0-9]+)/(verifier|decline|publish)/$#', $path, $match)) {
        site_verify_action((int) $match[1], $match[2]);
    } elseif ($path === '/reviews/') {
        site_reviews_page();
    } elseif (preg_match(SITE_REVIEW_ACTION_PATTERN, $path, $match)) {
        site_review_action($match[1], (int) $match[2], $match[3]);
    } else {
        return false;
    }

    return true;
}

/**
 * Request of the game under the URL of its page.
 *
 * The site answers in place of the backend the uploads of the editor pages and the ghosts of the
 * track pages, to know their account, and the download of the draft of a draft page. The other
 * endpoints of the backend and the icons are served as they are.
 *
 * @param string $page Page of the game: `create`, `endurance`, `drafts/<id>`, `tracks/<id>` or
 *   `verify/<id>`.
 * @param string $file Path requested under the page, an endpoint or an icon.
 */
function site_game_request(string $page, string $file): void
{
    $kind = explode('/', $page)[0];
    $id = (int) (explode('/', $page)[1] ?? 0);

    if (strpos($file, 'media/') === 0) {
        site_serve_file(SITE_GAME_MEDIA_DIR, substr($file, strlen('media/')));
        return;
    }

    // Only reads the account: the game sends its requests in parallel
    site_start_session(true);

    // The endurance mode generates its tracks: it only saves and downloads runs
    if ($kind === 'endurance') {
        if ($file === 'backend/db/enduranceupload/') {
            site_endurance_upload_endpoint();
        } elseif ($file === 'backend/db/ghostdata/') {
            site_endurance_ghost_endpoint();
        } else {
            openrider_respond(404, ['error' => 'Not found']);
        }
        return;
    }

    // A track waiting for verification exists only in the uploads of the site
    if ($kind === 'verify') {
        if ($file === 'backend/db/trackdata/') {
            site_pending_track_endpoint($id);
        } elseif ($file === 'backend/db/ghostdata/') {
            site_verification_ghost_endpoint($id);
        } elseif ($file === 'backend/db/ghostupload/') {
            site_verification_endpoint($id);
        } else {
            openrider_respond(404, ['error' => 'Not found']);
        }
        return;
    }

    // Racing a track never uploads one, and editing a track never saves a ghost
    if ($file === 'backend/db/trackupload/' && $kind !== 'tracks') {
        site_upload_endpoint($kind === 'drafts' ? $id : null);
    } elseif ($file === 'backend/db/ghostupload/' && $kind === 'tracks') {
        site_ghost_endpoint($id);
    } elseif (in_array($file, ['backend/db/trackupload/', 'backend/db/ghostupload/'], true)) {
        openrider_respond(404, ['error' => 'Not found']);
    } elseif ($file === 'backend/db/trackdata/' && $kind === 'drafts') {
        site_draft_endpoint($id);
    } elseif ($file === 'backend/db/ghostdata/' && $kind === 'tracks') {
        site_track_ghost_endpoint($id);
    } else {
        site_backend_endpoint(substr($file, strlen('backend/db/'), -1));
    }
}

/** Another endpoint of the backend, requested by the game. */
function site_backend_endpoint(string $name): void
{
    $endpoint = SITE_GAME_ENDPOINTS_DIR . '/' . $name . '/index.php';
    if (!is_file($endpoint)) {
        site_not_found();
        return;
    }

    require $endpoint;
}
