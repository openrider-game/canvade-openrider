<?php

/**
 * Comments on the tracks (see db/comments.php): posted from the track page, under the game, and
 * deleted by the admins only.
 */

/**
 * Posts a comment of the account on a track, or a reply to one of its comments with `parent`:
 * a reply to a reply answers the comment of that reply, the replies staying on one level. Then
 * back to the comment on the track page.
 */
function site_comment_post(int $trackId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    if (site_find_track($db, $trackId) === null) {
        site_not_found();
        return;
    }

    $text = site_form_text('text');
    // Counts characters, not bytes; invalid UTF-8 does not match either
    if (!preg_match('/^.{1,' . SITE_COMMENT_MAX_LENGTH . '}$/su', $text)) {
        http_response_code(422);
        site_render_message(
            'Comment not posted',
            'A comment is valid text of 1 to ' . SITE_COMMENT_MAX_LENGTH . ' characters.'
        );
        return;
    }

    $parentId = null;
    if (($_POST['parent'] ?? '') !== '') {
        $parent = site_find_comment($db, (int) $_POST['parent']);
        if ($parent === null || (int) $parent['TRACKID'] !== $trackId) {
            site_not_found();
            return;
        }
        $parentId = $parent['PARENTID'] === null ? (int) $parent['ID'] : (int) $parent['PARENTID'];
    }

    if (!site_take_rate_limit($db, 'comment', (string) $user['ID'])) {
        http_response_code(429);
        site_render_message('Too many comments', 'Try again later.');
        return;
    }

    $commentId = site_insert_comment($db, $trackId, $user['ID'], $parentId, $text);
    site_redirect("/tracks/$trackId/#comment-$commentId");
}

/**
 * Deletes a comment with its replies, posted by an admin, then back to the comments of its
 * track. The other accounts are answered as for an unknown comment.
 */
function site_comment_delete(int $commentId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $comment = site_find_comment($db, $commentId);
    if ($comment === null || !site_can($user, 'moderate')) {
        site_not_found();
        return;
    }

    site_delete_comment($db, $commentId);
    site_audit(
        $db,
        $user,
        'delete',
        "comment #$commentId",
        'on track #' . (int) $comment['TRACKID'] . ': ' . mb_substr((string) $comment['TEXT'], 0, 80, 'UTF-8')
    );
    site_redirect('/tracks/' . (int) $comment['TRACKID'] . '/#comments');
}
