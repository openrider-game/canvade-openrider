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
 */

require_once __DIR__ . '/src/auth.php';
require_once __DIR__ . '/src/database.php';
require_once __DIR__ . '/src/format.php';
require_once __DIR__ . '/src/security.php';
require_once __DIR__ . '/src/view.php';

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

/** Largest seed of an endurance track: the game takes 32 bits unsigned integers. */
const SITE_MAX_ENDURANCE_SEED = 4294967295;

/** Actions of the admins on a ghost or a verifying run: its kind, id and the action. */
const SITE_REVIEW_ACTION_PATTERN = '#^/reviews/(ghosts|tracks)/([0-9]+)/(approve|reject)/$#';

/** Riders listed in the top of a track, each with their best ghost. */
const SITE_LEADERBOARD_RIDERS = 10;

/** Accounts listed on a page of `/users/`. */
const SITE_USERS_PER_PAGE = 50;

/** Maximum length of the title of a track, in characters. */
const SITE_TITLE_MAX_LENGTH = 60;

/** Maximum length of the description of a track, in characters. */
const SITE_DESCRIPTION_MAX_LENGTH = 500;

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
 * Endurance page: the game riding an infinite generated track, the one of the `seed` parameter
 * (the track number shown by the game), else a new one on each load. The track of the day is the
 * same for everyone, from the date in UTC.
 */
function site_endurance_page(): void
{
    $seed = $_GET['seed'] ?? null;
    $seed = is_string($seed) && preg_match('/^[0-9]{1,10}$/', $seed)
        && (int) $seed <= SITE_MAX_ENDURANCE_SEED ? (int) $seed : null;

    site_render_page(
        'endurance',
        'Endurance',
        ['seed' => $seed, 'dailySeed' => site_daily_endurance_seed()],
        ['game.css'],
        ['/dist/main.js'],
    );
}

/** Seed of the endurance track of the day, from the date in UTC. */
function site_daily_endurance_seed(): int
{
    // Unsigned 32 bits, as PHP runs on 64 bits
    return crc32('openrider-endurance-' . gmdate('Y-m-d')) & SITE_MAX_ENDURANCE_SEED;
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

    $ghosts = site_find_ghosts($db, $trackId);
    $viewer = site_user();
    // The ghosts waiting for an admin are out of the ranking, listed for their account only
    $ranked = array_filter($ghosts, fn (array $ghost) => $ghost['REVIEW'] === null);
    $riders = site_group_riders($ranked);
    $mine = $viewer === null ? [] : array_values(array_filter(
        $ghosts,
        fn (array $ghost) => (int) $ghost['USERID'] === $viewer['ID']
    ));
    $myRank = array_search('user:' . ($viewer['ID'] ?? ''), array_keys($riders), true);

    site_render_page(
        'track',
        site_track_title($track),
        [
            'track' => $track,
            // Indexed by rank from 0, the keys of the riders dropped
            'top' => array_slice(array_values($riders), 0, SITE_LEADERBOARD_RIDERS),
            'riderCount' => count($riders),
            'mine' => $mine,
            'myRank' => $myRank === false ? null : $myRank + 1,
        ],
        ['game.css'],
        // The leaderboard drives the game through its page API, set up by the game script, and
        // shows its tabs and the other ghosts of its riders with its own script
        ['/dist/main.js', '/assets/js/leaderboard.js', '/assets/js/leaderboard-tabs.js'],
    );
}

/**
 * Groups the ghosts of a track by rider, the riders ranked by their best ghost: a rider with
 * several of the best times counts once.
 *
 * The riders are the accounts of the ghosts, or the names of their ghost strings for the ghosts
 * saved without the site.
 *
 * @param array[] $ghosts Ghosts, fastest first, see site_find_ghosts().
 * @return array[] Riders by key (`user:<id>` or `name:<name>`), best first: their `NAME` and
 * their `GHOSTS`, fastest first.
 */
function site_group_riders(array $ghosts): array
{
    $riders = [];
    foreach ($ghosts as $ghost) {
        $key = $ghost['USERID'] !== null
            ? 'user:' . (int) $ghost['USERID']
            : 'name:' . strtolower(site_ghost_name($ghost['GHOSTSTRING']));
        // The first ghost of a rider is their best: they keep the rank it gives them
        $riders[$key] ??= [
            'NAME' => $ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING']),
            'GHOSTS' => [],
        ];
        $riders[$key]['GHOSTS'][] = $ghost;
    }

    return $riders;
}

/**
 * The accounts by name, SITE_USERS_PER_PAGE a page, with the number of their tracks and ghosts:
 * the `q` parameter of the URL searches the names holding it, `page` gives the page, from 1.
 */
function site_users_page(): void
{
    $search = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    $page = max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT));

    $db = site_db();
    $count = site_count_users($db, $search);
    $pages = max(1, (int) ceil($count / SITE_USERS_PER_PAGE));
    $page = min($page, $pages);

    site_render_page('users', 'Users', [
        'search' => $search,
        'count' => $count,
        'page' => $page,
        'pages' => $pages,
        'users' => site_find_users(
            $db,
            $search,
            ($page - 1) * SITE_USERS_PER_PAGE,
            SITE_USERS_PER_PAGE
        ),
    ]);
}

/** The published tracks and the ghosts of an account. */
function site_user_page(string $name): void
{
    $db = site_db();
    $user = site_find_user_by_name($db, $name);
    if ($user === null) {
        site_not_found();
        return;
    }
    $userId = (int) $user['ID'];

    site_render_page('user', $user['NAME'], [
        'userId' => $userId,
        'name' => $user['NAME'],
        'tracks' => site_find_tracks($db, $userId),
        // With the ghosts waiting for an admin for the account itself and the admins
        'ghosts' => site_find_user_ghosts($db, $userId, site_can_delete(site_user(), $userId)),
    ]);
}

/**
 * Register or log in form, opening the page given by `next` once done.
 *
 * @param string $form `register` or `login`.
 */
function site_account_page(string $form): void
{
    if (site_user() !== null) {
        site_redirect(site_next_page());
        return;
    }

    $name = '';
    $errors = [];
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $name = site_form_text('name');
        $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';

        if (!site_check_csrf()) {
            $errors['form'] = 'The form has expired, send it again.';
        } elseif ($form === 'register') {
            $confirmation = is_string($_POST['confirmation'] ?? null) ? $_POST['confirmation'] : '';
            $errors = site_register($name, $password, $confirmation);
        } else {
            $error = site_authenticate($name, $password);
            if ($error !== null) {
                $errors['form'] = $error;
            }
        }

        if (!$errors) {
            site_redirect(site_next_page());
            return;
        }
        http_response_code(422);
    }

    site_render_page('account', $form === 'register' ? 'Register' : 'Log in', [
        'form' => $form,
        'name' => $name,
        'errors' => $errors,
    ]);
}

/** Logs out with a posted form, the link of the header, then opens the front page. */
function site_logout(): void
{
    if (!site_check_posted_form()) {
        return;
    }

    site_log_out();
    site_redirect('/');
}

/**
 * Whether the request posts a form of the site, with its CSRF token; answers 405 or 403
 * otherwise.
 */
function site_check_posted_form(): bool
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        header('Allow: POST');
        return false;
    }
    if (!site_check_csrf()) {
        http_response_code(403);
        site_render_message('The form has expired', 'Go back, reload the page and send it again.');
        return false;
    }

    return true;
}

/**
 * Deletes a track, a ghost, a draft or an account with a posted form, for its own account or an
 * admin, then opens the page it was on.
 *
 * @param string $kind `tracks`, `ghosts`, `drafts` or `users`.
 * @param string $key  Id of the track, ghost or draft, or name of the account.
 */
function site_delete(string $kind, string $key): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }

    $db = site_db();
    $id = ctype_digit($key) ? (int) $key : 0;
    if ($kind === 'tracks') {
        $track = site_find_track($db, $id);
        if ($track !== null && site_can_delete($user, $track['USERID'])) {
            site_delete_track($db, $id);
            site_redirect('/');
            return;
        }
    } elseif ($kind === 'ghosts') {
        $ghost = site_find_ghost($db, $id);
        // The run verifying a track is its proof: only the admins delete it
        $track = $ghost === null ? null : site_find_track($db, (int) $ghost['TRACKID']);
        $verifying = $track !== null && (int) $track['VERIFICATIONGHOSTID'] === $id;
        if (
            $ghost !== null
            && site_can_delete($user, $ghost['USERID'])
            && (!$verifying || site_is_admin($user))
        ) {
            site_delete_ghost($db, $id);
            site_redirect('/tracks/' . (int) $ghost['TRACKID'] . '/');
            return;
        }
    } elseif ($kind === 'drafts') {
        // Only the account of a draft sees it
        if (site_find_upload($db, $id, $user['ID']) !== null) {
            site_delete_upload($db, $id);
            site_redirect('/drafts/');
            return;
        }
    } else {
        $target = site_find_user_by_name($db, $key);
        if ($target !== null && site_can_delete($user, $target['ID'])) {
            site_delete_user($db, (int) $target['ID']);
            if ((int) $target['ID'] === $user['ID']) {
                site_log_out();
            }
            site_redirect('/');
            return;
        }
    }

    // Unknown, or not deletable by the account: not told apart
    site_not_found();
}

/**
 * The logged in account, or null after redirecting to the log in page, which opens the current
 * page again once logged in.
 */
function site_require_user(): ?array
{
    $user = site_user();
    if ($user === null) {
        $page = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        site_redirect('/login/?next=' . rawurlencode($page));
    }

    return $user;
}

/** Editor page of a new track. */
function site_create_page(): void
{
    if (site_require_user() === null) {
        return;
    }

    $data = ['draft' => null];
    site_render_page('editor', 'Create a track', $data, ['game.css'], ['/dist/main.js']);
}

/** The drafts of the account, and the tracks it made or verifies waiting for verification. */
function site_drafts_page(): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }

    $db = site_db();
    site_render_page('drafts', 'Drafts', [
        'user' => $user,
        'pending' => site_find_pending_tracks($db, $user['ID']),
        'drafts' => site_find_drafts($db, $user['ID']),
    ]);
}

/** Editor page of a draft: the game editing it, downloaded from site_draft_endpoint(). */
function site_draft_page(int $draftId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $draft = site_find_upload(site_db(), $draftId, $user['ID']);
    if ($draft === null || !site_is_saved_draft($draft)) {
        site_not_found();
        return;
    }

    site_render_page(
        'editor',
        'Edit ' . $draft['TITLE'],
        ['draft' => $draft],
        ['game.css'],
        ['/dist/main.js'],
    );
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

    // The endurance mode generates its tracks and saves its records in the browser
    if ($kind === 'endurance') {
        openrider_respond(404, ['error' => 'Not found']);
        return;
    }

    // Only reads the account: the game sends its requests in parallel
    site_start_session(true);

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
    } else {
        site_backend_endpoint(substr($file, strlen('backend/db/'), -1));
    }
}

/**
 * Answers 413 to a request of the game larger than the `post_max_size` of PHP, whose parameters
 * PHP drops, rather than telling they are missing.
 */
function site_check_post_size(): void
{
    if (!$_POST && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        openrider_respond(413, ['error' => 'The upload is larger than the server accepts']);
    }
}

/** The logged in account, or null after answering 401 to the request of the game. */
function site_require_api_user(string $message): ?array
{
    $user = site_user();
    if ($user === null) {
        openrider_respond(401, ['error' => $message]);
    }

    return $user;
}

/**
 * Upload endpoint of the editor pages, in place of the trackupload endpoint of the backend and
 * with its parameters and response: keeps the track code or editor file in the uploads of the
 * account, whose page the game opens next. The editor file of a draft replaces its own, keeping
 * its title and description.
 *
 * @param int|null $draftId Draft of the editor page, null for a new track.
 */
function site_upload_endpoint(?int $draftId): void
{
    openrider_handle(function (PDO $db) use ($draftId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to upload your track');
        site_check_post_size();

        $code = openrider_string_param('trackCode');
        if (strlen($code) > SITE_TRACK_MAX_BYTES) {
            openrider_respond(413, ['error' => 'The track is too large']);
        }
        $thumbnail = openrider_string_param('thumbnail', false);
        if ($thumbnail !== '' && !site_check_thumbnail($thumbnail)) {
            openrider_reject('Invalid parameter: thumbnail');
        }
        $thumbnail = $thumbnail === '' ? null : $thumbnail;

        if (!site_take_rate_limit($db, 'upload', (string) $user['ID'])) {
            openrider_respond(429, ['error' => 'Too many uploads, try again later']);
        }

        $draft = $draftId === null ? null : site_find_upload($db, $draftId, $user['ID']);
        if ($draft !== null && site_is_saved_draft($draft) && site_is_editor_file($code)) {
            site_update_draft($db, $draftId, $code, $thumbnail);
            return ['ID' => $draftId];
        }

        return ['ID' => site_insert_upload($db, $user['ID'], $code, $thumbnail)];
    });
}

/**
 * Download endpoint of the game editing a draft, in place of the trackdata endpoint of the
 * backend and with its parameters and response.
 */
function site_draft_endpoint(int $draftId): void
{
    openrider_handle(function (PDO $db) use ($draftId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to edit your draft');

        // The game asks for the id of its host element, the draft of the page
        $draft = openrider_int_param('id') === $draftId
            ? site_find_upload($db, $draftId, $user['ID'])
            : null;
        if ($draft === null || !site_is_saved_draft($draft)) {
            openrider_respond(404, ['error' => 'Draft not found']);
        }

        return ['CODE' => $draft['CODE'], 'THUMBNAIL' => $draft['THUMBNAIL']];
    });
}

/**
 * Reads the ghost posted by the game: its ghost string, in the format the game writes, and its
 * time, the one of the ghost string. Answers 400 otherwise.
 *
 * @param int $trackId Track of the page, which the game posts as the track of its host element.
 * @return array The ghost string and the time.
 */
function site_read_ghost_params(int $trackId): array
{
    $ghostString = openrider_string_param('ghostString');
    if (!site_check_ghost_string($ghostString)) {
        openrider_reject('Invalid parameter: ghostString');
    }
    if (openrider_int_param('trackId') !== $trackId) {
        openrider_reject('Invalid parameter: trackId');
    }
    $time = openrider_int_param('time', 1);
    // The time of the ghost string, its next to last field
    if ((int) explode(',', $ghostString)[5] !== $time) {
        openrider_reject('Invalid parameter: time');
    }

    return [$ghostString, $time];
}

/**
 * Replays a ghost on its track, answering 422 to the game when it does not match, and counts it
 * for the rate limit of the account first: replaying costs the server.
 */
function site_check_ghost_run(
    PDO $db,
    array $user,
    string $code,
    string $ghostString,
    int $time
): void {
    if (!site_take_rate_limit($db, 'ghost', (string) $user['ID'])) {
        openrider_respond(429, ['error' => 'Too many ghosts saved, try again later']);
    }
    $refusal = site_verify_ghost($code, $ghostString, $time);
    if ($refusal !== null) {
        openrider_respond(422, ['error' => "The ghost does not match the track: $refusal"]);
    }
}

/**
 * Ghost endpoint of the track pages, in place of the ghostupload endpoint of the backend and
 * with its parameters and response: saves the ghost for the account, named after it, once
 * verified by replaying it (see site_verify_ghost()). A ghost whose inputs look suspicious is
 * kept for an admin, out of the leaderboard (see site_analyse_ghost()).
 */
function site_ghost_endpoint(int $trackId): void
{
    openrider_handle(function (PDO $db) use ($trackId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to save your ghost');
        site_check_post_size();
        [$ghostString, $time] = site_read_ghost_params($trackId);

        $track = site_find_track($db, $trackId);
        if ($track === null) {
            openrider_respond(404, ['error' => 'Track does not exist']);
        }
        site_check_ghost_run($db, $user, $track['CODE'], $ghostString, $time);
        $reasons = site_analyse_ghost($ghostString, $time, site_find_best_time($db, $trackId));

        $ghostId = site_insert_ghost(
            $db,
            $user['ID'],
            site_name_ghost($ghostString, $user['NAME']),
            $trackId,
            $time,
            $reasons ? implode('; ', $reasons) : null
        );
        if ($ghostId === null) {
            openrider_respond(404, ['error' => 'Track does not exist']);
        }

        return ['ID' => $ghostId];
    });
}

/**
 * A track code waiting for verification, for its author, its verifier and the admins, or null
 * for the others or when it does not exist.
 */
function site_find_pending_track(PDO $db, int $uploadId, ?array $user): ?array
{
    $upload = site_find_any_upload($db, $uploadId);
    if (
        $upload === null
        || $user === null
        || $upload['TITLE'] === null
        || site_is_editor_file($upload['CODE'])
    ) {
        return null;
    }

    $allowed = in_array($user['ID'], [(int) $upload['USERID'], (int) $upload['VERIFIERID']], true)
        || site_is_admin($user);
    return $allowed ? $upload : null;
}

/**
 * State of the verification of a track: `pending` until its verifier saves a run, `review`
 * while an admin checks that run, then `verified`, ready to be published.
 */
function site_verification_state(array $upload): string
{
    if ($upload['VERIFICATIONGHOST'] === null) {
        return 'pending';
    }
    return $upload['REVIEW'] === null ? 'verified' : 'review';
}

/**
 * Download endpoint of the game on a verification page, in place of the trackdata endpoint of
 * the backend and with its parameters and response.
 */
function site_pending_track_endpoint(int $uploadId): void
{
    openrider_handle(function (PDO $db) use ($uploadId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to race this track');

        // The game asks for the id of its host element, the track of the page
        $upload = openrider_int_param('id') === $uploadId
            ? site_find_pending_track($db, $uploadId, $user)
            : null;
        if ($upload === null) {
            openrider_respond(404, ['error' => 'Track does not exist']);
        }

        return ['CODE' => $upload['CODE'], 'THUMBNAIL' => $upload['THUMBNAIL']];
    });
}

/**
 * Ghost download endpoint of the game on a verification page, in place of the ghostdata
 * endpoint of the backend: the verifying run, the only ghost of the track, whose id is the one
 * of the track.
 */
function site_verification_ghost_endpoint(int $uploadId): void
{
    openrider_handle(function (PDO $db) use ($uploadId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to watch this run');

        $upload = openrider_int_param('id') === $uploadId
            ? site_find_pending_track($db, $uploadId, $user)
            : null;
        if ($upload === null || $upload['VERIFICATIONGHOST'] === null) {
            openrider_respond(404, ['error' => 'Ghost does not exist']);
        }

        return ['GHOSTSTRING' => $upload['VERIFICATIONGHOST']];
    });
}

/**
 * Ghost endpoint of the game on a verification page: saves the run of the verifier as the
 * verification of the track, once verified by replaying it. A run whose inputs look suspicious
 * waits for an admin before the track can be published.
 */
function site_verification_endpoint(int $uploadId): void
{
    openrider_handle(function (PDO $db) use ($uploadId) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to verify this track');
        site_check_post_size();
        [$ghostString, $time] = site_read_ghost_params($uploadId);

        $upload = site_find_pending_track($db, $uploadId, $user);
        if ($upload === null) {
            openrider_respond(404, ['error' => 'Track does not exist']);
        }
        if ((int) $upload['VERIFIERID'] !== $user['ID']) {
            openrider_respond(403, ['error' => 'Only the verifier of this track can verify it']);
        }
        if ($upload['VERIFICATIONGHOST'] !== null) {
            openrider_respond(409, ['error' => 'This track is already verified']);
        }
        site_check_ghost_run($db, $user, $upload['CODE'], $ghostString, $time);
        $reasons = site_analyse_ghost($ghostString, $time, null);

        site_set_verification(
            $db,
            $uploadId,
            site_name_ghost($ghostString, $user['NAME']),
            $time,
            $reasons ? implode('; ', $reasons) : null
        );

        return ['ID' => $uploadId];
    });
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

/**
 * Page of an upload of the account, opened by the game after uploading: a form giving the title
 * and the description of the track. A track code is then published and opens its track page; an
 * editor file cannot be raced, so it is saved as a draft instead and listed with the others.
 */
function site_upload_page(int $uploadId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $upload = site_find_upload($db, $uploadId, $user['ID']);
    if ($upload === null) {
        site_not_found();
        return;
    }
    $isDraft = site_is_editor_file($upload['CODE']);
    // A saved draft keeps its title and description, also when its editor file is replaced, and
    // a track code sent to verification waits for it on its own page
    if ($upload['TITLE'] !== null) {
        site_redirect($isDraft ? '/drafts/' : "/verify/$uploadId/");
        return;
    }

    $values = ['title' => '', 'description' => '', 'verifier' => $user['NAME']];
    $errors = [];
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $values = [
            'title' => site_form_text('title'),
            'description' => site_form_text('description'),
            'verifier' => site_form_text('verifier'),
        ];
        $verifier = $isDraft ? null : site_find_user_by_name($db, $values['verifier']);
        $errors = site_check_csrf()
            ? site_validate_track_details($values)
            : ['form' => 'The form has expired, send it again.'];
        if (!$isDraft && $verifier === null) {
            $errors['verifier'] = 'No account has this name.';
        }
        if (!$errors) {
            // See Other: reloading the next page does not post the form again
            if ($isDraft) {
                site_save_draft($db, $uploadId, $values['title'], $values['description']);
                site_redirect('/drafts/');
            } else {
                site_submit_for_verification(
                    $db,
                    $uploadId,
                    $values['title'],
                    $values['description'],
                    (int) $verifier['ID']
                );
                site_redirect("/verify/$uploadId/");
            }
            return;
        }
        http_response_code(422);
    }

    site_render_page('upload', $isDraft ? 'Save a draft' : 'Send a track to verification', [
        'upload' => $upload,
        'isDraft' => $isDraft,
        'values' => $values,
        'errors' => $errors,
    ]);
}

/**
 * Verification page of a track, for its author, its verifier and the admins: the game racing it,
 * where the verifier saves the run verifying it, then the button publishing it for its author.
 */
function site_verify_page(int $uploadId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $upload = site_find_pending_track(site_db(), $uploadId, $user);
    if ($upload === null) {
        site_not_found();
        return;
    }

    site_render_page(
        'verify',
        'Verify ' . $upload['TITLE'],
        ['upload' => $upload, 'user' => $user, 'state' => site_verification_state($upload)],
        ['game.css'],
        // The verifying run races with the button of the leaderboards, and the page reloads once
        // the verification changes
        ['/dist/main.js', '/assets/js/leaderboard.js', '/assets/js/verification.js'],
    );
}

/** State of the verification of a track as JSON, `{ "state" }`, polled by its page. */
function site_verify_status(int $uploadId): void
{
    // Only reads the account: the page asks again every few seconds
    session_write_close();
    $upload = site_find_pending_track(site_db(), $uploadId, site_user());
    if ($upload === null) {
        // Published or deleted meanwhile
        openrider_respond(404, ['error' => 'Track does not exist']);
    }

    openrider_respond(200, ['state' => site_verification_state($upload)]);
}

/**
 * Posted action on a track waiting for verification:
 *
 * - `verifier`: its author gives the verification to another account, before it is verified;
 * - `decline`: its verifier gives the verification back to its author, before verifying it;
 * - `publish`: its author publishes it once verified, with the verifying run as first ghost.
 */
function site_verify_action(int $uploadId, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $upload = site_find_pending_track($db, $uploadId, $user);
    if ($upload === null) {
        site_not_found();
        return;
    }

    $isAuthor = (int) $upload['USERID'] === $user['ID'];
    $isVerifier = (int) $upload['VERIFIERID'] === $user['ID'];
    $state = site_verification_state($upload);

    if ($action === 'verifier' && $isAuthor && $state === 'pending') {
        $verifier = site_find_user_by_name($db, site_form_text('verifier'));
        if ($verifier === null) {
            http_response_code(422);
            site_render_message('No account has this name', 'Go back and check the user name.');
            return;
        }
        site_set_verifier($db, $uploadId, (int) $verifier['ID']);
        site_redirect("/verify/$uploadId/");
    } elseif ($action === 'decline' && $isVerifier && !$isAuthor && $state === 'pending') {
        site_set_verifier($db, $uploadId, (int) $upload['USERID']);
        site_redirect('/drafts/');
    } elseif ($action === 'publish' && $isAuthor && $state === 'verified') {
        $trackId = site_publish_verified($db, $upload);
        site_redirect("/tracks/$trackId/");
    } else {
        http_response_code(409);
        site_render_message(
            'This cannot be done now',
            'The verification of the track changed meanwhile: go back and reload its page.'
        );
    }
}

/** The ghosts and verifying runs waiting for an admin, for the admins only. */
function site_reviews_page(): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    if (!site_is_admin($user)) {
        site_not_found();
        return;
    }

    $db = site_db();
    site_render_page('reviews', 'Reviews', [
        'ghosts' => site_find_ghost_reviews($db),
        'verifications' => site_find_verification_reviews($db),
    ]);
}

/**
 * Approves or rejects a ghost or a verifying run waiting for an admin. A rejected ghost is
 * deleted, a rejected verifying run dropped, the verifier being able to save another one.
 *
 * @param string $kind   `ghosts`, or `tracks` for the verifying runs.
 * @param string $action `approve` or `reject`.
 */
function site_review_action(string $kind, int $id, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    if (!site_is_admin($user)) {
        site_not_found();
        return;
    }

    $db = site_db();
    if ($kind === 'ghosts' && $action === 'approve') {
        site_approve_ghost($db, $id);
    } elseif ($kind === 'ghosts') {
        site_delete_ghost($db, $id);
    } elseif ($action === 'approve') {
        site_approve_verification($db, $id);
    } else {
        site_set_verification($db, $id, null, null, null);
    }
    site_redirect('/reviews/');
}

/** Downloads the editor file of an upload of the account, e.g. to keep a copy of a draft. */
function site_editor_file(int $uploadId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $upload = site_find_upload(site_db(), $uploadId, $user['ID']);
    if ($upload === null || !site_is_editor_file($upload['CODE'])) {
        site_not_found();
        return;
    }

    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="track.openrider.json"');
    echo $upload['CODE'];
}

/** A text field of the posted form, trimmed with `\n` line breaks, empty when missing. */
function site_form_text(string $name): string
{
    $value = $_POST[$name] ?? '';
    // Browsers post `\r\n` line breaks, but count them as one character in `maxlength`
    return is_string($value) ? trim(str_replace("\r\n", "\n", $value)) : '';
}

/**
 * Error messages of the title and the description of a track, by field, empty when both are
 * valid: required, and at most SITE_TITLE_MAX_LENGTH and SITE_DESCRIPTION_MAX_LENGTH characters.
 *
 * @param array $values `title` and `description`.
 * @return string[]
 */
function site_validate_track_details(array $values): array
{
    $limits = [
        'title' => ['Title', SITE_TITLE_MAX_LENGTH],
        'description' => ['Description', SITE_DESCRIPTION_MAX_LENGTH],
    ];

    $errors = [];
    foreach ($limits as $field => [$label, $maxLength]) {
        $value = $values[$field];
        if ($value === '') {
            $errors[$field] = "$label is required.";
        } elseif (!preg_match('/^.{1,' . $maxLength . '}$/su', $value)) {
            // Counts characters, not bytes; invalid UTF-8 does not match either
            $errors[$field] = "$label must be valid text of at most $maxLength characters.";
        }
    }

    return $errors;
}

/** Answers 303 See Other, redirecting to a page of the site. */
function site_redirect(string $url): void
{
    http_response_code(303);
    header('Location: ' . $url);
}

/** Renders a page showing a message under its title. */
function site_render_message(string $title, string $text): void
{
    site_render_page('message', $title, ['title' => $title, 'text' => $text]);
}

/** Answers 404 with the not found page. */
function site_not_found(): void
{
    http_response_code(404);
    site_render_page('not-found', 'Page not found');
}

/** Serves a file of a folder, refusing the paths leading out of it. */
function site_serve_file(string $dir, string $relativePath): void
{
    $root = realpath($dir);
    $file = realpath($dir . '/' . $relativePath);
    $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));

    if (
        $root === false
        || $file === false
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
