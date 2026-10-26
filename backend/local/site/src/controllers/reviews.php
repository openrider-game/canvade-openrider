<?php

/**
 * Moderation by the admins of the ghosts, verifying runs and endurance runs whose inputs look
 * suspicious.
 */

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
        'runs' => site_find_endurance_reviews($db),
    ]);
}

/**
 * Approves or rejects a ghost, a verifying run or an endurance run waiting for an admin. A
 * rejected ghost or endurance run is deleted, a rejected verifying run dropped, the verifier
 * being able to save another one.
 *
 * @param string $kind   `ghosts`, `tracks` for the verifying runs, or `runs` for the
 *                       endurance runs.
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
    } elseif ($kind === 'runs' && $action === 'approve') {
        site_approve_endurance_run($db, $id);
    } elseif ($kind === 'runs') {
        site_delete_endurance_run($db, $id);
    } elseif ($action === 'approve') {
        site_approve_verification($db, $id);
    } else {
        site_set_verification($db, $id, null, null, null);
    }
    site_redirect('/reviews/');
}
