<?php

/**
 * Notifications of the account (see db/notifications.php): counted in the header, listed on
 * `/notifications/`, each opening what it is about (`/notifications/<id>/`), which reads it.
 */

/** The last notifications of the account, the unread ones first. */
function site_notifications_page(): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    site_render_page('notifications', 'Notifications', [
        'notifications' => site_find_notifications(site_db(), $user['ID']),
    ], ['forum.css']);
}

/** Opens what a notification of the account is about, reading it. */
function site_notification_open(int $notificationId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $notification = site_find_notification($db, $notificationId, $user['ID']);
    if ($notification === null) {
        site_not_found();
        return;
    }
    site_mark_notification_seen($db, $notificationId);

    $subjectId = (int) $notification['SUBJECTID'];
    $targetId = (int) $notification['TARGETID'];
    if ($notification['KIND'] === SITE_NOTIFY_FORUM_REPLY) {
        // The first reply, else the first post unread, e.g. once the reply is deleted
        if (site_find_forum_post($db, $targetId) !== null) {
            site_forum_post_redirect($targetId);
        } else {
            site_forum_unread($subjectId);
        }
    } elseif (site_find_comment($db, $targetId) !== null) {
        site_comment_redirect($targetId);
    } elseif ($notification['KIND'] === SITE_NOTIFY_TRACK_COMMENT) {
        site_redirect("/tracks/$subjectId/#comments");
    } else {
        site_comment_redirect($subjectId);
    }
}

/** Marks every notification of the account read, then back to them. */
function site_notifications_read(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    site_mark_notifications_seen(site_db(), $user['ID']);
    site_redirect('/notifications/');
}

/** Text of a notification, escaped: who did what, on what. */
function site_notification_html(array $notification): string
{
    $count = (int) $notification['COUNT'];
    $actor = '<strong>' . h($notification['ACTOR'] ?? 'A deleted account') . '</strong>';
    $subject = '<strong>' . h($notification['SUBJECT'] ?? 'something deleted') . '</strong>';
    $last = ', the last by ' . h($notification['ACTOR'] ?? 'a deleted account');
    switch ($notification['KIND']) {
        case SITE_NOTIFY_FORUM_REPLY:
            return $count === 1 ? "$actor replied in $subject" : "$count new replies in $subject$last";
        case SITE_NOTIFY_TRACK_COMMENT:
            return $count === 1
                ? "$actor commented on your track $subject"
                : "$count new comments on your track $subject$last";
        default:
            // A thread of comments the account wrote in
            return $count === 1
                ? "$actor replied in your comment thread on $subject"
                : "$count new replies in your comment thread on $subject$last";
    }
}
