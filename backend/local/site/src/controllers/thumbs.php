<?php

/**
 * Thumbs up of the tracks and the ghosts: an account gives one to the tracks and ghosts of the
 * others, and takes it back with the same button (see `templates/partials/thumbs.php`).
 */

/**
 * Whether an account can thumb up a track or a ghost: logged in, not its own, and for a ghost,
 * not waiting for an admin.
 *
 * @param array $subject Track or ghost, with its account (`USERID`, null without one) and, for a
 *                       ghost, why it waits for an admin (`REVIEW`).
 */
function site_can_thumb(?array $user, array $subject): bool
{
    return $user !== null
        && ($subject['USERID'] === null || (int) $subject['USERID'] !== $user['ID'])
        && ($subject['REVIEW'] ?? null) === null;
}

/**
 * Gives or takes back a thumb up, with a posted form: `/tracks/<id>/thumb/` or
 * `/ghosts/<id>/thumb/`.
 *
 * Answers `{ "THUMBS", "THUMBED" }` (the number of thumbs, and whether the account gives one) to
 * the script of the button, asking for JSON, else opens the page of the `next` parameter, the
 * page the button was on.
 *
 * @param string $kind Kind of the subject, a key of SITE_THUMB_KINDS.
 */
function site_thumb(string $kind, int $subjectId): void
{
    $json = strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
    if (!site_check_posted_form()) {
        return;
    }
    $user = $json ? site_user() : site_require_user();
    if ($user === null) {
        if ($json) {
            openrider_respond(401, ['error' => 'Log in to like']);
        }
        return;
    }

    $db = site_db();
    $kind = SITE_THUMB_KINDS[$kind];
    $subject = $kind === 'track'
        ? site_find_track($db, $subjectId)
        : site_find_ghost($db, $subjectId);
    if ($subject === null || !site_can_thumb($user, $subject)) {
        // Unknown, or not for the account: not told apart
        site_not_found();
        return;
    }
    if (!site_take_rate_limit($db, 'thumb', (string) $user['ID'])) {
        if ($json) {
            openrider_respond(429, ['error' => 'Too many likes, try again later']);
        }
        http_response_code(429);
        site_render_message('Too many likes', 'Try again later.');
        return;
    }

    $thumbed = site_toggle_thumb($db, $kind, $subjectId, $user['ID']);
    if ($json) {
        openrider_respond(200, [
            'THUMBS' => site_count_thumbs($db, $kind, $subjectId),
            'THUMBED' => $thumbed,
        ]);
    }
    site_redirect(site_next_page());
}
