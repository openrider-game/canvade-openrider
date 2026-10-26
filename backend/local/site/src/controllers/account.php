<?php

/**
 * Account forms of the logged in visitor: registering, logging in and out, and deleting what an
 * account made.
 */

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
