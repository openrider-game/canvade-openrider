<?php

/**
 * Verification of the tracks before they are published: the verification page racing a track,
 * the endpoints of its game, and the actions of its author and verifier.
 */

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
        ['track.css', 'game.css'],
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
