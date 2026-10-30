<?php

/**
 * Editor pages and the uploads of their tracks: creating a track, the drafts of the account, the
 * upload endpoint of the game and the page naming an upload, saving it as a draft or sending it
 * to verification.
 */

/** Maximum length of the title of a track, in characters. */
const SITE_TITLE_MAX_LENGTH = 60;

/** Maximum length of the description of a track, in characters. */
const SITE_DESCRIPTION_MAX_LENGTH = 500;

/** Editor page of a new track. */
function site_create_page(): void
{
    if (site_require_user() === null) {
        return;
    }

    $data = ['draft' => null] + site_collab_data('/create/');
    site_render_page(
        'editor',
        'Create a track',
        $data,
        ['game.css'],
        ['/dist/main.js', '/assets/js/share.js']
    );
}

/**
 * Editing session of an editor page (`?collab=`), the accounts with its link editing the track
 * together: the first one gives the track, the others joining from `/create/?collab=`.
 *
 * @param string $page Path of the editor page.
 * @return array `collab`, the session of the page; `collabToken`, the token of the account for
 *   it; `newCollab`, the page starting a new one; all null without live sessions.
 */
function site_collab_data(string $page): array
{
    $collab = site_live_session('collab');
    return [
        'collab' => $collab,
        'collabToken' => $collab === null ? null : site_live_token($collab, 'edit'),
        'newCollab' => site_live_enabled() && $collab === null
            ? $page . '?collab=' . site_new_live_session()
            : null,
    ];
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
        ['draft' => $draft] + site_collab_data('/drafts/' . $draftId . '/'),
        ['game.css'],
        ['/dist/main.js', '/assets/js/share.js'],
    );
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

        $code = openrider_code_param('trackCode');
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

        // Made in an editing session: its other editors are credited
        $credits = $_POST['credits'] ?? '';
        $collaborators = is_string($credits) ? site_live_credits($credits, $user['ID']) : '';

        $draft = $draftId === null ? null : site_find_upload($db, $draftId, $user['ID']);
        $savedDraft = $draft !== null && site_is_saved_draft($draft);
        if ($savedDraft && site_is_editor_file($code)) {
            site_update_draft($db, $draftId, $code, $thumbnail, $collaborators);
            return ['ID' => $draftId];
        }
        // A track published from a draft credits those who edited the draft at some point
        if ($savedDraft) {
            $collaborators = site_merge_ids($draft['COLLABORATORS'], $collaborators);
        }

        return ['ID' => site_insert_upload($db, $user['ID'], $code, $thumbnail, $collaborators)];
    });
}

/**
 * Download endpoint of the game editing a draft, in place of the trackdata endpoint of the
 * backend and with its parameters and response: the bytes of the track file.
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

        openrider_respond_code($draft['CODE']);
    });
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
    ], ['upload.css']);
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

    // As the game names them, the drafts saved before the track files being JSON
    if (openrider_is_track_file($upload['CODE'])) {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="track-editor.ortrack"');
    } else {
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="track.openrider.json"');
    }
    echo $upload['CODE'];
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
