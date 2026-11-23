<?php

/**
 * Comments on the tracks, in `LOCAL_COMMENTS`: written by the accounts under a track, the newest
 * first, each with its replies, the oldest first. A reply answers a comment, never a reply: the
 * replies stay on one level. Comments are neither edited nor deleted by their accounts, only by
 * the admins; an account deleted leaves its comments without their text, so that the replies to
 * them still read.
 */

/** Characters of a comment. */
const SITE_COMMENT_MAX_LENGTH = 1000,
    /** Comments listed per page of a track, their replies with them. */
    SITE_COMMENTS_PER_PAGE = 30;

/**
 * Saves a comment of an account on a track, returning its id.
 *
 * @param ?int $parentId Comment it replies to, a comment of the track that is no reply, or null.
 */
function site_insert_comment(PDO $db, int $trackId, int $userId, ?int $parentId, string $text): int
{
    $statement = $db->prepare(
        'INSERT INTO "LOCAL_COMMENTS" ("TRACKID", "USERID", "PARENTID", "TEXT", "CREATED")'
        . ' VALUES (:trackId, :userId, :parentId, :text, :created) RETURNING "ID"'
    );
    $statement->execute([
        'trackId' => $trackId,
        'userId' => $userId,
        'parentId' => $parentId,
        'text' => $text,
        'created' => time(),
    ]);

    return (int) $statement->fetchColumn();
}

/**
 * A comment with its account (`USERID`, null once deleted, and `AUTHOR`), or null.
 */
function site_find_comment(PDO $db, int $commentId): ?array
{
    $statement = $db->prepare(
        'SELECT c.*, u."NAME" AS "AUTHOR" FROM "LOCAL_COMMENTS" c'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = c."USERID" WHERE c."ID" = :id'
    );
    $statement->execute(['id' => $commentId]);
    $comment = $statement->fetch(PDO::FETCH_ASSOC);

    return $comment === false ? null : $comment;
}

/** Number of comments on a track, replies included. */
function site_count_comments(PDO $db, int $trackId): int
{
    $statement = $db->prepare('SELECT COUNT(*) FROM "LOCAL_COMMENTS" WHERE "TRACKID" = :id');
    $statement->execute(['id' => $trackId]);

    return (int) $statement->fetchColumn();
}

/**
 * A page of the comments of a track, the newest first, each with its `REPLIES`, the oldest first:
 * `ID`, `USERID`, `AUTHOR` (null once the account is deleted), `TEXT`, `CREATED` and `THUMBS`.
 *
 * @param int $page Page from 1.
 * @return array{comments: array[], pages: int}
 */
function site_find_track_comments(PDO $db, int $trackId, int $page): array
{
    $select = 'SELECT c."ID", c."USERID", c."PARENTID", c."TEXT", c."CREATED", u."NAME" AS "AUTHOR", '
        . site_thumbs_column('comment', 'c."ID"')
        . ' FROM "LOCAL_COMMENTS" c LEFT JOIN "LOCAL_USERS" u ON u."ID" = c."USERID"';

    $count = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_COMMENTS" WHERE "TRACKID" = :id AND "PARENTID" IS NULL'
    );
    $count->execute(['id' => $trackId]);
    $pages = max(1, (int) ceil((int) $count->fetchColumn() / SITE_COMMENTS_PER_PAGE));

    $statement = $db->prepare(
        $select . ' WHERE c."TRACKID" = :id AND c."PARENTID" IS NULL'
        . ' ORDER BY c."ID" DESC LIMIT ' . SITE_COMMENTS_PER_PAGE
        . ' OFFSET ' . (max(1, $page) - 1) * SITE_COMMENTS_PER_PAGE
    );
    $statement->execute(['id' => $trackId]);
    $comments = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $comment) {
        $comment['REPLIES'] = [];
        $comments[(int) $comment['ID']] = $comment;
    }

    if ($comments) {
        $ids = implode(',', array_keys($comments));
        $replies = $db->query(
            $select . " WHERE c.\"PARENTID\" IN ($ids) ORDER BY c.\"ID\""
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($replies as $reply) {
            $comments[(int) $reply['PARENTID']]['REPLIES'][] = $reply;
        }
    }

    return ['comments' => array_values($comments), 'pages' => $pages];
}

/** Deletes a comment with its replies and their thumbs up, e.g. by an admin. */
function site_delete_comment(PDO $db, int $commentId): void
{
    site_transaction($db, function () use ($db, $commentId) {
        $params = ['id' => $commentId];
        $ids = site_select_ids(
            $db,
            'SELECT "ID" FROM "LOCAL_COMMENTS" WHERE "ID" = :id OR "PARENTID" = :id',
            $params
        );
        foreach ($ids as $id) {
            site_delete_thumbs($db, 'comment', (int) $id);
        }
        $db->prepare('DELETE FROM "LOCAL_COMMENTS" WHERE "ID" = :id OR "PARENTID" = :id')
            ->execute($params);
    });
}

/** Deletes the comments of tracks with their thumbs up, in the transaction of the caller. */
function site_delete_track_comments(PDO $db, int $trackId): void
{
    $ids = site_select_ids(
        $db,
        'SELECT "ID" FROM "LOCAL_COMMENTS" WHERE "TRACKID" = :id',
        ['id' => $trackId]
    );
    foreach ($ids as $commentId) {
        site_delete_thumbs($db, 'comment', (int) $commentId);
    }
    $db->prepare('DELETE FROM "LOCAL_COMMENTS" WHERE "TRACKID" = :id')->execute(['id' => $trackId]);
}

/**
 * Takes the text and the account off the comments of an account being deleted, the comments
 * staying for the replies to them, in the transaction of the caller.
 */
function site_forget_user_comments(PDO $db, int $userId): void
{
    $db->prepare(
        'UPDATE "LOCAL_COMMENTS" SET "USERID" = NULL, "TEXT" = \'\' WHERE "USERID" = :userId'
    )->execute(['userId' => $userId]);
}
