<?php

/**
 * Notifications of the accounts (`LOCAL_NOTIFICATIONS`), shown in the header and on
 * `/notifications/`:
 *
 * - SITE_NOTIFY_FORUM_REPLY: replies in a topic the account follows (see `LOCAL_FORUM_WATCHES`),
 *   about the topic, from the first reply unseen;
 * - SITE_NOTIFY_TRACK_COMMENT: comments on a track of the account, about the track, from the
 *   first comment unseen;
 * - SITE_NOTIFY_COMMENT_REPLY: replies to a comment the account wrote or replied to, about that
 *   comment, from the first reply unseen.
 *
 * While unread, the notifications of the same thing are one, counting them (`COUNT`), with the
 * account and time of the last one: a busy topic makes one line, not twenty. Opening what they
 * are about reads them; the read ones are kept SITE_NOTIFICATIONS_KEPT_DAYS.
 */

const SITE_NOTIFY_FORUM_REPLY = 'forum-reply',
    SITE_NOTIFY_TRACK_COMMENT = 'track-comment',
    SITE_NOTIFY_COMMENT_REPLY = 'comment-reply';

/** Notifications listed on their page, the newest first. */
const SITE_NOTIFICATIONS_LISTED = 50;

/** Days the read notifications are kept. */
const SITE_NOTIFICATIONS_KEPT_DAYS = 90;

/**
 * Tells accounts of something, but the account doing it: added to their unread notification of
 * the same thing, else a new one.
 *
 * @param int[]  $userIds   Accounts told, each once.
 * @param string $kind      One of the SITE_NOTIFY_ constants.
 * @param int    $subjectId What it is about: the topic, the track or the comment replied to.
 * @param int    $targetId  What happened: the post or the comment, opened by the notification.
 * @param int    $actorId   Account doing it, never told.
 */
function site_notify(PDO $db, array $userIds, string $kind, int $subjectId, int $targetId, int $actorId): void
{
    $userIds = array_diff(array_unique(array_map('intval', $userIds)), [$actorId]);
    if (!$userIds) {
        return;
    }
    site_transaction($db, function () use ($db, $userIds, $kind, $subjectId, $targetId, $actorId) {
        $now = time();
        // The first unseen stays the target: the notification opens there
        $group = $db->prepare(
            'UPDATE "LOCAL_NOTIFICATIONS" SET "COUNT" = "COUNT" + 1, "ACTORID" = :actor, "CREATED" = :now'
            . ' WHERE "USERID" = :userId AND "KIND" = :kind AND "SUBJECTID" = :subject AND "SEEN" = 0'
        );
        $insert = $db->prepare(
            'INSERT INTO "LOCAL_NOTIFICATIONS" ("USERID", "KIND", "SUBJECTID", "TARGETID", "ACTORID", "CREATED")'
            . ' VALUES (:userId, :kind, :subject, :target, :actor, :now)'
        );
        foreach ($userIds as $userId) {
            $params = ['userId' => $userId, 'kind' => $kind, 'subject' => $subjectId, 'actor' => $actorId, 'now' => $now];
            $group->execute($params);
            if ($group->rowCount() === 0) {
                $insert->execute($params + ['target' => $targetId]);
            }
        }
    });
}

/** Number of notifications unread by an account, for the header. */
function site_count_notifications(PDO $db, int $userId): int
{
    try {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM "LOCAL_NOTIFICATIONS" WHERE "USERID" = :userId AND "SEEN" = 0'
        );
        $statement->execute(['userId' => $userId]);
        return (int) $statement->fetchColumn();
    } catch (PDOException $error) {
        // The header never fails for it, e.g. before the tables are created
        return 0;
    }
}

/**
 * The last notifications of an account, the newest first, with the account of the last one
 * (`ACTOR`, null once deleted) and the title of what they are about (`SUBJECT`, null once
 * deleted). The read ones older than SITE_NOTIFICATIONS_KEPT_DAYS are deleted meanwhile.
 */
function site_find_notifications(PDO $db, int $userId): array
{
    $db->prepare('DELETE FROM "LOCAL_NOTIFICATIONS" WHERE "USERID" = :userId AND "SEEN" = 1 AND "CREATED" < :limit')
        ->execute(['userId' => $userId, 'limit' => time() - SITE_NOTIFICATIONS_KEPT_DAYS * 86400]);

    $statement = $db->prepare(
        'SELECT n.*, u."NAME" AS "ACTOR" FROM "LOCAL_NOTIFICATIONS" n'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = n."ACTORID"'
        . ' WHERE n."USERID" = :userId ORDER BY n."SEEN", n."CREATED" DESC, n."ID" DESC'
        . ' LIMIT ' . SITE_NOTIFICATIONS_LISTED
    );
    $statement->execute(['userId' => $userId]);
    $notifications = $statement->fetchAll(PDO::FETCH_ASSOC);

    // The titles of the topics and tracks, read at once per kind
    $subjects = [];
    foreach ($notifications as $notification) {
        $subjects[$notification['KIND']][] = (int) $notification['SUBJECTID'];
    }
    $titles = [];
    foreach ($subjects as $kind => $ids) {
        $titles[$kind] = site_notification_titles($db, $kind, array_values(array_unique($ids)));
    }
    foreach ($notifications as &$notification) {
        $notification['SUBJECT'] = $titles[$notification['KIND']][(int) $notification['SUBJECTID']] ?? null;
    }
    return $notifications;
}

/**
 * Titles of what notifications of a kind are about, by id: the topics, or the tracks commented
 * (see site_track_title()).
 *
 * @param int[] $ids
 * @return array<int, string>
 */
function site_notification_titles(PDO $db, string $kind, array $ids): array
{
    $placeholders = implode(', ', array_fill(0, count($ids), '?'));
    if ($kind === SITE_NOTIFY_FORUM_REPLY) {
        $query = "SELECT \"ID\", \"TITLE\" FROM \"LOCAL_FORUM_TOPICS\" WHERE \"ID\" IN ($placeholders)";
    } elseif ($kind === SITE_NOTIFY_TRACK_COMMENT) {
        $query = 'SELECT t."ID", d."TITLE" FROM "TRACKS" t'
            . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
            . " WHERE t.\"ID\" IN ($placeholders)";
    } elseif ($kind === SITE_NOTIFY_COMMENT_REPLY) {
        // The comment replied to, by the title of its track
        $query = 'SELECT c."ID", c."TRACKID", d."TITLE" FROM "LOCAL_COMMENTS" c'
            . ' JOIN "TRACKS" t ON t."ID" = c."TRACKID"'
            . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = c."TRACKID"'
            . " WHERE c.\"ID\" IN ($placeholders)";
    } else {
        return [];
    }
    $statement = $db->prepare($query);
    $statement->execute($ids);

    $titles = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $titles[(int) $row['ID']] = $kind === SITE_NOTIFY_FORUM_REPLY
            ? $row['TITLE']
            : site_track_title(['ID' => $row['TRACKID'] ?? $row['ID'], 'TITLE' => $row['TITLE']]);
    }
    return $titles;
}

/** A notification of an account, or null. */
function site_find_notification(PDO $db, int $notificationId, int $userId): ?array
{
    $statement = $db->prepare('SELECT * FROM "LOCAL_NOTIFICATIONS" WHERE "ID" = :id AND "USERID" = :userId');
    $statement->execute(['id' => $notificationId, 'userId' => $userId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Marks a notification read. */
function site_mark_notification_seen(PDO $db, int $notificationId): void
{
    $db->prepare('UPDATE "LOCAL_NOTIFICATIONS" SET "SEEN" = 1 WHERE "ID" = :id')->execute(['id' => $notificationId]);
}

/**
 * Marks every notification of an account read, or those of a kind.
 *
 * @param ?string $kind One of the SITE_NOTIFY_ constants, null for all.
 */
function site_mark_notifications_seen(PDO $db, int $userId, ?string $kind = null): void
{
    $params = ['userId' => $userId];
    if ($kind !== null) {
        $params['kind'] = $kind;
    }
    $db->prepare(
        'UPDATE "LOCAL_NOTIFICATIONS" SET "SEEN" = 1 WHERE "USERID" = :userId AND "SEEN" = 0'
        . ($kind === null ? '' : ' AND "KIND" = :kind')
    )->execute($params);
}

/**
 * Marks read the notifications of an account about things it sees, e.g. the topic it opened.
 *
 * @param int[] $subjectIds What they are about.
 * @param ?int  $upTo       Last target seen, e.g. the last post of the page of a topic: the
 *                          notifications starting later stay unread. Null for any.
 */
function site_mark_notifications_seen_about(PDO $db, int $userId, string $kind, array $subjectIds, ?int $upTo = null): void
{
    if (!$subjectIds) {
        return;
    }
    $placeholders = implode(', ', array_fill(0, count($subjectIds), '?'));
    $params = array_merge([$userId, $kind], array_map('intval', array_values($subjectIds)));
    $limit = '';
    if ($upTo !== null) {
        $limit = ' AND "TARGETID" <= ?';
        $params[] = $upTo;
    }
    $db->prepare(
        'UPDATE "LOCAL_NOTIFICATIONS" SET "SEEN" = 1 WHERE "USERID" = ? AND "KIND" = ? AND "SEEN" = 0'
        . " AND \"SUBJECTID\" IN ($placeholders)$limit"
    )->execute($params);
}

/**
 * Deletes the notifications about things deleted, in the transaction of the caller.
 *
 * @param int[] $subjectIds
 */
function site_delete_notifications(PDO $db, string $kind, array $subjectIds): void
{
    if (!$subjectIds) {
        return;
    }
    $placeholders = implode(', ', array_fill(0, count($subjectIds), '?'));
    $db->prepare("DELETE FROM \"LOCAL_NOTIFICATIONS\" WHERE \"KIND\" = ? AND \"SUBJECTID\" IN ($placeholders)")
        ->execute(array_merge([$kind], array_map('intval', array_values($subjectIds))));
}

/**
 * Forgets an account deleted, in the transaction of the caller: its notifications go, and those
 * of the others it caused stay without its account.
 */
function site_forget_user_notifications(PDO $db, int $userId): void
{
    $params = ['userId' => $userId];
    $db->prepare('DELETE FROM "LOCAL_NOTIFICATIONS" WHERE "USERID" = :userId')->execute($params);
    $db->prepare('UPDATE "LOCAL_NOTIFICATIONS" SET "ACTORID" = NULL WHERE "ACTORID" = :userId')->execute($params);
}

/**
 * The accounts told of a reply to a comment: the account of the comment and those of its other
 * replies, without the deleted ones.
 *
 * @return int[]
 */
function site_find_comment_thread_accounts(PDO $db, int $commentId): array
{
    return site_select_ids(
        $db,
        'SELECT DISTINCT "USERID" FROM "LOCAL_COMMENTS"'
        . ' WHERE ("ID" = :id OR "PARENTID" = :parent) AND "USERID" IS NOT NULL',
        ['id' => $commentId, 'parent' => $commentId]
    );
}
