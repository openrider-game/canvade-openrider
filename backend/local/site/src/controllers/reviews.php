<?php

/**
 * Moderation by the admins of the ghosts, verifying runs and endurance runs whose inputs look
 * suspicious, and of the ghosts the riders reported.
 */

/** The runs waiting for an admin, and the reported ghosts, for the admins only. */
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
        'reports' => site_find_ghost_reports($db),
    ], [], ['/assets/js/ghost-inputs.js']);
}

/**
 * Approves or rejects a ghost, a verifying run or an endurance run waiting for an admin. A
 * rejected ghost or endurance run is deleted, a rejected verifying run dropped, the verifier
 * being able to save another one. The reports of a ghost are dismissed, or the ghost rejected,
 * deleting it with its reports.
 *
 * @param string $kind   `ghosts`, `tracks` for the verifying runs, `runs` for the endurance
 *                       runs, or `reports` for the reported ghosts.
 * @param string $action `approve` or `reject`; `dismiss` or `reject` for the reports.
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

    // The reports are dismissed rather than approved, the runs approved rather than dismissed
    if ($kind === 'reports' ? $action === 'approve' : $action === 'dismiss') {
        site_not_found();
        return;
    }

    $db = site_db();
    if ($kind === 'reports' && $action === 'dismiss') {
        site_dismiss_ghost_reports($db, $id);
    } elseif ($kind === 'reports') {
        site_delete_ghost($db, $id);
    } elseif ($kind === 'ghosts' && $action === 'approve') {
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
