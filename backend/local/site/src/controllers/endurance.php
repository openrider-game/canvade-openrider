<?php

/**
 * Endurance page and its endpoints: the game riding infinite generated tracks, and the
 * leaderboard of the track of the day, its runs saved and raced as ghosts.
 */

/** Largest seed of an endurance track: the game takes 32 bits unsigned integers. */
const SITE_MAX_ENDURANCE_SEED = 4294967295;

/** Riders listed in the leaderboard of an endurance track, each with their best run. */
const SITE_ENDURANCE_LEADERBOARD = 10;

/**
 * Time after midnight (UTC) during which the runs on the track of the day before are still
 * saved, in seconds: for the runs started before midnight.
 */
const SITE_ENDURANCE_GRACE = 600;

/**
 * Versions of the generator of the endurance tracks of the game, by the first day (UTC) of the
 * tracks of the day generated with them.
 *
 * A seed gives another track in another version: a run is saved with the version of its track,
 * and replayed on it. Each version must exist in the game (`terrain/versions.ts`), which a test
 * of the game checks. Releasing a version is adding it here with a day to come, once the game
 * knowing it is deployed: the tracks of the day switch to it on that day, keeping the
 * leaderboards of the days before on their own version.
 */
const SITE_ENDURANCE_VERSIONS = [1 => '1970-01-01', 2 => '2026-10-28'];

/**
 * Endurance page: the game riding an infinite generated track, the one of the `seed` parameter
 * (the track number shown by the game) on the version of the generator of the `version`
 * parameter, the version of the day by default; else a new track on each load. The track of the
 * day is the same for everyone, from the date in UTC.
 *
 * The track of the day has a leaderboard: the best run of each account, saved by the game once
 * replayed (see site_endurance_upload_endpoint()), racing as a ghost when clicked. The tracks of
 * the days before keep theirs, closed.
 *
 * A link with the `rider` parameter, shared by an account, races its run on the track from the
 * start: its best run on the track, the same link racing its better runs once saved.
 */
function site_endurance_page(): void
{
    $seed = $_GET['seed'] ?? null;
    $seed = is_string($seed) && preg_match('/^[0-9]{1,10}$/', $seed)
        && (int) $seed <= SITE_MAX_ENDURANCE_SEED ? (int) $seed : null;
    $version = $_GET['version'] ?? null;
    $version = is_string($version) && preg_match('/^[0-9]{1,4}$/', $version)
        && isset(SITE_ENDURANCE_VERSIONS[(int) $version])
        ? (int) $version
        : site_endurance_version_of_day();

    $db = site_db();
    $user = site_user();
    $open = $seed !== null && site_endurance_track_open($seed, $version);
    $riderCount = $seed === null ? 0 : site_count_endurance_runs($db, $seed, $version);
    $mine = $seed === null || $user === null
        ? null
        : site_find_endurance_run_of($db, $seed, $version, $user['ID']);

    // The rider of a shared link, raced from the start
    $rider = $_GET['rider'] ?? null;
    $rider = $seed !== null && is_string($rider) && preg_match(SITE_USER_NAME_PATTERN, $rider)
        ? $rider
        : null;
    $rival = $rider === null
        ? null
        : site_find_endurance_run_by_name(
            $db,
            $seed,
            $version,
            $rider,
            $user['ID'] ?? null,
            site_is_admin($user)
        );

    // A live session races a given track, the one of the button below for a new track
    $live = $seed === null ? null : site_live_session();
    $newLive = site_live_enabled() && $live === null
        ? site_endurance_url($seed ?? random_int(0, SITE_MAX_ENDURANCE_SEED), $version, [
            'live' => site_new_live_session(),
        ])
        : null;

    $attributes = ['base-url' => '/endurance/', 'game-mode' => 'endurance'];
    if ($seed !== null) {
        $attributes['seed'] = $seed;
        $attributes['version'] = $version;
    }
    if ($live !== null) {
        $attributes['live-url'] = site_live_url();
        $attributes['live-token'] = site_live_token($live, ['seed' => $seed, 'version' => $version]);
    }
    if ($rival !== null) {
        $attributes['ghosts'] = $rival['ID'];
    }
    // The game uploads the runs beating the best one of the account
    if ($open && $user !== null) {
        $attributes['endurance-save'] = 1;
        if ($mine !== null) {
            $attributes['endurance-best'] = $mine['DISTANCE'] . ',' . $mine['TIME'];
        }
    }

    site_render_page(
        'endurance',
        'Endurance',
        [
            'seed' => $seed,
            'version' => $version,
            'daily' => $seed === site_daily_endurance_seed()
                && $version === site_endurance_version_of_day(),
            'attributes' => $attributes,
            // Only the tracks of the day have a leaderboard, closed after their day
            'leaderboard' => $open || $riderCount > 0,
            'open' => $open,
            'top' => $seed === null
                ? []
                : site_find_endurance_runs($db, $seed, $version, SITE_ENDURANCE_LEADERBOARD),
            'riderCount' => $riderCount,
            'mine' => $mine,
            'rider' => $rider,
            'rival' => $rival,
            'live' => $live,
            'newLive' => $newLive,
            // The admins watch the runs waiting for them before approving them
            'reviews' => $seed !== null && site_is_admin($user)
                ? site_find_endurance_reviews($db, $seed, $version)
                : [],
        ],
        ['endurance.css', 'game.css'],
        // The leaderboard adds the ghosts to the race, and shows the runs saved by the game
        [
            '/dist/main.js',
            '/assets/js/leaderboard.js',
            '/assets/js/endurance-leaderboard.js',
            '/assets/js/share.js',
            '/assets/js/live-results.js',
        ],
    );
}

/**
 * Seed of the endurance track of a day, from its date in UTC.
 *
 * @param int|null $time Unix timestamp of the day, now by default.
 */
function site_daily_endurance_seed(?int $time = null): int
{
    // Unsigned 32 bits, as PHP runs on 64 bits
    $date = gmdate('Y-m-d', $time ?? time());
    return crc32('openrider-endurance-' . $date) & SITE_MAX_ENDURANCE_SEED;
}

/**
 * Version of the generator of the tracks of a day: the last one released on that day, see
 * SITE_ENDURANCE_VERSIONS.
 *
 * @param int|null $time Unix timestamp of the day, now by default.
 */
function site_endurance_version_of_day(?int $time = null): int
{
    $date = gmdate('Y-m-d', $time ?? time());
    $released = array_filter(SITE_ENDURANCE_VERSIONS, fn (string $day) => $day <= $date);
    return max(array_keys($released));
}

/** Link of the endurance page riding the track of the day. */
function site_daily_endurance_url(): string
{
    return site_endurance_url(site_daily_endurance_seed(), site_endurance_version_of_day());
}

/** Link of the endurance page riding a track, a seed on a version of the generator. */
function site_endurance_url(int $seed, int $version, array $params = []): string
{
    return '/endurance/?' . http_build_query(['seed' => $seed, 'version' => $version] + $params);
}

/**
 * Whether the runs on an endurance track are saved: the track of the day, a seed on the version
 * of the day, or the one of the day before shortly after midnight.
 */
function site_endurance_track_open(int $seed, int $version): bool
{
    $now = time();
    foreach ([$now, $now - SITE_ENDURANCE_GRACE] as $time) {
        if (
            $seed === site_daily_endurance_seed($time)
            && $version === site_endurance_version_of_day($time)
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Upload endpoint of the endurance page, called by the game once a run on the track of the day
 * is over (see EnduranceService of the game): `seed` and `version` (its track), `ghostString` and
 * `time` (the last tick alive), and `distance`, as claimed by the game in whole meters.
 *
 * The run is replayed on its track, measuring its distance, then kept as the run of
 * the account on the track if it beats the one before. A run whose inputs look suspicious waits
 * for an admin, out of the leaderboard (see site_analyse_ghost()). Answers the id of the run and
 * its rank, 0 while it waits for an admin.
 */
function site_endurance_upload_endpoint(): void
{
    openrider_handle(function (PDO $db) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to save your run');
        site_check_post_size();

        $seed = openrider_int_param('seed', 0);
        $version = openrider_int_param('version');
        $ghostString = openrider_string_param('ghostString');
        if (!site_check_ghost_string($ghostString)) {
            openrider_reject('Invalid parameter: ghostString');
        }
        $time = openrider_int_param('time', 1);
        // The time of the ghost string, its next to last field
        if ((int) explode(',', $ghostString)[5] !== $time) {
            openrider_reject('Invalid parameter: time');
        }
        $claimed = openrider_int_param('distance', 0);
        if ($seed > SITE_MAX_ENDURANCE_SEED || !site_endurance_track_open($seed, $version)) {
            openrider_respond(409, ['error' => 'This is not the track of the day anymore']);
        }

        if (!site_take_rate_limit($db, 'ghost', (string) $user['ID'])) {
            openrider_respond(429, ['error' => 'Too many runs saved, try again later']);
        }
        [$refusal, $distance] = site_verify_endurance_run(
            $seed,
            $version,
            $ghostString,
            $time,
            $claimed
        );
        if ($refusal !== null) {
            openrider_respond(422, ['error' => "The run does not match its track: $refusal"]);
        }

        // Further, or as far and faster, than the run of the account before
        $before = site_find_endurance_run_of($db, $seed, $version, $user['ID']);
        if (
            $before !== null
            && ((int) $before['DISTANCE'] > $distance
                || ((int) $before['DISTANCE'] === $distance && (int) $before['TIME'] <= $time))
        ) {
            openrider_respond(409, ['error' => 'Your run of the day is already better']);
        }

        $reasons = site_analyse_ghost($ghostString, $time, null);
        $runId = site_save_endurance_run(
            $db,
            $user['ID'],
            $seed,
            $version,
            site_name_ghost($ghostString, $user['NAME']),
            $distance,
            $time,
            $reasons ? implode('; ', $reasons) : null
        );

        return [
            'ID' => $runId,
            'RANK' => $reasons ? 0 : site_endurance_rank($db, $seed, $version, $distance, $time),
        ];
    });
}

/**
 * Ghost endpoint of the endurance page, in place of the ghostdata endpoint of the backend: the
 * ghost string of a ranked run (`id`) on the track ridden by the game (`seed` and `version`), of
 * a run of the account, or of any run for the admins, watching the runs waiting for them. A run
 * of another track is not found: its ghost would not ride the track of the game.
 */
function site_endurance_ghost_endpoint(): void
{
    openrider_handle(function (PDO $db) {
        site_create_tables($db);
        $user = site_user();
        $ghostString = site_find_endurance_ghost(
            $db,
            openrider_int_param('id'),
            openrider_int_param('seed', 0),
            openrider_int_param('version'),
            $user['ID'] ?? null,
            site_is_admin($user)
        );
        if ($ghostString === null) {
            openrider_respond(404, ['error' => 'Run does not exist']);
        }

        return ['GHOSTSTRING' => $ghostString];
    });
}
