<?php

/**
 * Published tracks: the front page listing them, the track pages with the leaderboard of their
 * ghosts, and the ghost endpoints of the game racing them.
 */

/** Most ghosts of a shared link racing from the start, as the game takes them. */
const SITE_LINKED_GHOSTS = 10;

/** Riders listed in the top of a track, each with their best ghost. */
const SITE_LEADERBOARD_RIDERS = 10;

/** The published tracks: the newest first, or the most liked first with `?sort=liked`. */
function site_home_page(): void
{
    // Two tabs: the newest tracks, and with `?sort=liked` the most liked ones
    $mostLiked = ($_GET['sort'] ?? '') === 'liked';
    site_render_page('home', 'Tracks', [
        'tracks' => site_find_tracks(site_db(), null, $mostLiked),
        'mostLiked' => $mostLiked,
    ], ['home.css']);
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
    [$linked, $missing] = site_linked_ghosts($ghosts, $viewer);
    // What the account thumbed up, its buttons pressed
    $thumbed = $viewer === null ? [] : site_find_thumbed(
        $db,
        'ghost',
        $viewer['ID'],
        array_map('intval', array_column($ghosts, 'ID'))
    );

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
            'linked' => $linked,
            'missing' => $missing,
            'trackThumbed' => $viewer !== null
                && site_find_thumbed($db, 'track', $viewer['ID'], [$trackId]),
            'thumbed' => $thumbed,
        ],
        ['track.css', 'game.css'],
        // The leaderboard drives the game through its page API, set up by the game script, and
        // shows its tabs and the other ghosts of its riders with its own script; the race is
        // shared with its ghosts, and its thumbs up given without leaving the page
        [
            '/dist/main.js',
            '/assets/js/leaderboard.js',
            '/assets/js/leaderboard-tabs.js',
            '/assets/js/share.js',
            '/assets/js/thumbs.js',
        ],
    );
}

/**
 * The ghosts of a shared link, racing from the start: the `ghosts` parameter, ids separated with
 * commas. Only the ghosts of the track count, those waiting for an admin for their account and
 * the admins only.
 *
 * @param array[] $ghosts Ghosts of the track, see site_find_ghosts().
 * @return array The linked ghosts, in the order of the link, each with its rider (`NAME`), then
 *   the number of ids of the link that are not ghosts of the track.
 */
function site_linked_ghosts(array $ghosts, ?array $viewer): array
{
    $param = $_GET['ghosts'] ?? '';
    if (!is_string($param) || $param === '') {
        return [[], 0];
    }

    $ids = array_slice(
        array_unique(array_filter(array_map('intval', explode(',', $param)))),
        0,
        SITE_LINKED_GHOSTS
    );
    $byId = [];
    foreach ($ghosts as $ghost) {
        $visible = $ghost['REVIEW'] === null
            || site_is_admin($viewer)
            || ($viewer !== null && (int) $ghost['USERID'] === $viewer['ID']);
        if ($visible) {
            $byId[(int) $ghost['ID']] = $ghost + [
                'NAME' => $ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING']),
            ];
        }
    }

    $linked = array_values(array_filter(array_map(fn (int $id) => $byId[$id] ?? null, $ids)));
    return [$linked, count($ids) - count($linked)];
}

/**
 * Ghost endpoint of the track pages, in place of the ghostdata endpoint of the backend: the ghost
 * string of a ghost of the track, those waiting for an admin for their account and the admins
 * only, e.g. raced from a shared link.
 */
function site_track_ghost_endpoint(int $trackId): void
{
    openrider_handle(function (PDO $db) use ($trackId) {
        site_create_tables($db);
        if (openrider_int_param('trackId') !== $trackId) {
            openrider_reject('Invalid parameter: trackId');
        }

        $user = site_user();
        $ghostString = site_find_visible_ghost(
            $db,
            $trackId,
            openrider_int_param('id'),
            $user['ID'] ?? null,
            site_is_admin($user)
        );
        if ($ghostString === null) {
            openrider_respond(404, ['error' => 'Ghost does not exist']);
        }

        return ['GHOSTSTRING' => $ghostString];
    });
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
