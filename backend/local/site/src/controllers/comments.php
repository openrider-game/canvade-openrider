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

    // The accounts of the comment thread are told of a reply, the author of the track of a comment
    $accounts = $parentId === null ? [] : site_find_comment_thread_accounts($db, $parentId);
    $commentId = site_insert_comment($db, $trackId, $user['ID'], $parentId, $text);
    if ($parentId !== null) {
        site_notify($db, $accounts, SITE_NOTIFY_COMMENT_REPLY, $parentId, $commentId, $user['ID']);
    } else {
        $authorId = site_find_track($db, $trackId)['USERID'] ?? null;
        if ($authorId !== null) {
            site_notify($db, [(int) $authorId], SITE_NOTIFY_TRACK_COMMENT, $trackId, $commentId, $user['ID']);
        }
    }
    site_comment_redirect($commentId);
}

/**
 * Opens the page of the comments of a track holding a comment, on the comment: the comments are
 * listed the newest first, a reply with its comment.
 */
function site_comment_redirect(int $commentId): void
{
    $db = site_db();
    $comment = site_find_comment($db, $commentId);
    if ($comment === null) {
        site_not_found();
        return;
    }
    $trackId = (int) $comment['TRACKID'];
    $threadId = $comment['PARENTID'] === null ? $commentId : (int) $comment['PARENTID'];
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_COMMENTS" WHERE "TRACKID" = :track AND "PARENTID" IS NULL AND "ID" > :id'
    );
    $statement->execute(['track' => $trackId, 'id' => $threadId]);
    $page = intdiv((int) $statement->fetchColumn(), SITE_COMMENTS_PER_PAGE) + 1;
    site_redirect("/tracks/$trackId/" . ($page > 1 ? "?comments=$page" : '') . "#comment-$commentId");
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
