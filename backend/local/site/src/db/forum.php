<?php

/**
 * Queries of the forum: its categories (`LOCAL_FORUM_CATEGORIES`), their topics
 * (`LOCAL_FORUM_TOPICS`), the posts of the topics (`LOCAL_FORUM_POSTS`, the first one being the
 * topic itself), the previous versions of the posts edited (`LOCAL_FORUM_EDITS`) and the reports
 * of the posts (`LOCAL_FORUM_REPORTS`). Each topic keeps its number of posts and its last one, so
 * that the lists do not count them.
 */

/**
 * Categories created with the forum: slug, name, description and whether only the moderators
 * open topics there.
 */
const SITE_FORUM_DEFAULT_CATEGORIES = [
    ['announcements', 'Announcements', 'News of the site and the game.', true],
    ['general', 'General', 'Anything about OpenRider.', false],
    ['tracks', 'Tracks', 'Share your tracks and get feedback on them.', false],
    ['help', 'Help & Bugs', 'Questions, and what does not work as it should.', false],
];

/** Columns of a post with its account, for showing it (its e-mail address only for its avatar). */
const SITE_FORUM_POST_COLUMNS =
    'p."ID", p."TOPICID", p."USERID", p."TEXT", p."CREATED", p."EDITED",'
    . ' u."NAME" AS "AUTHOR", u."EMAIL", u."GRAVATAR"';

/**
 * Condition keeping the topics `t` with a post unread by the account of `:reader`, joined to its
 * read position `r` (see SITE_FORUM_READ_JOIN): a post newer than the last one it read, and than
 * the time before which everything is read for it (`:since`, see site_forum_read_since()).
 */
const SITE_FORUM_UNREAD = '(t."LASTPOSTAT" > :since AND t."LASTPOSTID" > COALESCE(r."POSTID", 0))';

/** Join of the read position `r` of the account of `:reader` on the topics `t`. */
const SITE_FORUM_READ_JOIN =
    ' LEFT JOIN "LOCAL_FORUM_READS" r ON r."TOPICID" = t."ID" AND r."USERID" = :reader';

/**
 * The categories in their order, each with its number of topics and posts, its topic with the
 * latest post (`LAST`, null without topic), and with a reader its number of topics with unread
 * posts (`UNREAD`, 0 without reader).
 *
 * @param ?array $reader The account reading, see site_forum_reader().
 */
function site_find_forum_categories(PDO $db, ?array $reader = null): array
{
    $unread = $reader === null ? '0' : '(SELECT COUNT(*) FROM "LOCAL_FORUM_TOPICS" t'
        . SITE_FORUM_READ_JOIN . ' WHERE t."CATEGORYID" = c."ID" AND ' . SITE_FORUM_UNREAD . ')';
    $statement = $db->prepare(
        'SELECT c.*,'
        . ' (SELECT COUNT(*) FROM "LOCAL_FORUM_TOPICS" t WHERE t."CATEGORYID" = c."ID") AS "TOPICS",'
        . ' (SELECT COALESCE(SUM(t."POSTS"), 0) FROM "LOCAL_FORUM_TOPICS" t'
        . ' WHERE t."CATEGORYID" = c."ID") AS "POSTS",'
        . " $unread AS \"UNREAD\""
        . ' FROM "LOCAL_FORUM_CATEGORIES" c ORDER BY c."POSITION", c."ID"'
    );
    $statement->execute($reader ?? []);
    $categories = $statement->fetchAll(PDO::FETCH_ASSOC);

    foreach ($categories as &$category) {
        $last = site_find_forum_topics($db, (int) $category['ID'], 0, 1, false);
        $category['LAST'] = $last[0] ?? null;
    }
    return $categories;
}

/** A category by its slug, or null. */
function site_find_forum_category(PDO $db, string $slug): ?array
{
    $statement = $db->prepare('SELECT * FROM "LOCAL_FORUM_CATEGORIES" WHERE "SLUG" = :slug');
    $statement->execute(['slug' => $slug]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** A category by its id, or null. */
function site_find_forum_category_by_id(PDO $db, int $categoryId): ?array
{
    $statement = $db->prepare('SELECT * FROM "LOCAL_FORUM_CATEGORIES" WHERE "ID" = :id');
    $statement->execute(['id' => $categoryId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Number of topics of a category. */
function site_count_forum_topics(PDO $db, int $categoryId): int
{
    $statement = $db->prepare('SELECT COUNT(*) FROM "LOCAL_FORUM_TOPICS" WHERE "CATEGORYID" = :id');
    $statement->execute(['id' => $categoryId]);

    return (int) $statement->fetchColumn();
}

/**
 * A page of the topics of a category, with their account (`AUTHOR`), the one of their last post
 * (`LASTAUTHOR`, null once deleted), and whether the reader has posts to read there (`UNREAD`, 1
 * or 0, always 0 without reader).
 *
 * @param bool   $pinnedFirst Whether the pinned topics come first, else only by their last post.
 * @param ?array $reader      The account reading, see site_forum_reader().
 */
function site_find_forum_topics(
    PDO $db,
    int $categoryId,
    int $offset,
    int $limit,
    bool $pinnedFirst = true,
    ?array $reader = null
): array {
    $statement = $db->prepare(
        'SELECT t.*, u."NAME" AS "AUTHOR", lu."NAME" AS "LASTAUTHOR",'
        . ($reader === null ? ' 0' : ' CASE WHEN ' . SITE_FORUM_UNREAD . ' THEN 1 ELSE 0 END')
        . ' AS "UNREAD" FROM "LOCAL_FORUM_TOPICS" t'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = t."USERID"'
        . ' LEFT JOIN "LOCAL_FORUM_POSTS" lp ON lp."ID" = t."LASTPOSTID"'
        . ' LEFT JOIN "LOCAL_USERS" lu ON lu."ID" = lp."USERID"'
        . ($reader === null ? '' : SITE_FORUM_READ_JOIN)
        . ' WHERE t."CATEGORYID" = :id'
        . ' ORDER BY ' . ($pinnedFirst ? 't."PINNED" DESC, ' : '') . 't."LASTPOSTAT" DESC, t."ID" DESC'
        . ' LIMIT :limit OFFSET :offset'
    );
    $statement->bindValue('id', $categoryId, PDO::PARAM_INT);
    $statement->bindValue('limit', $limit, PDO::PARAM_INT);
    $statement->bindValue('offset', $offset, PDO::PARAM_INT);
    foreach ($reader ?? [] as $name => $value) {
        $statement->bindValue($name, $value, PDO::PARAM_INT);
    }
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** A topic with its category (`SLUG`, `CATEGORY`, `STAFFONLY`) and its first post, or null. */
function site_find_forum_topic(PDO $db, int $topicId): ?array
{
    $statement = $db->prepare(
        'SELECT t.*, c."SLUG", c."NAME" AS "CATEGORY", c."STAFFONLY", u."NAME" AS "AUTHOR",'
        . ' (SELECT MIN(p."ID") FROM "LOCAL_FORUM_POSTS" p WHERE p."TOPICID" = t."ID") AS "FIRSTPOSTID"'
        . ' FROM "LOCAL_FORUM_TOPICS" t'
        . ' JOIN "LOCAL_FORUM_CATEGORIES" c ON c."ID" = t."CATEGORYID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = t."USERID"'
        . ' WHERE t."ID" = :id'
    );
    $statement->execute(['id' => $topicId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** A page of the posts of a topic, the oldest first, with their account and thumbs up. */
function site_find_forum_posts(PDO $db, int $topicId, int $offset, int $limit): array
{
    $statement = $db->prepare(
        'SELECT ' . SITE_FORUM_POST_COLUMNS . ', ' . site_thumbs_column('post', 'p."ID"')
        . ' FROM "LOCAL_FORUM_POSTS" p LEFT JOIN "LOCAL_USERS" u ON u."ID" = p."USERID"'
        . ' WHERE p."TOPICID" = :id ORDER BY p."ID" LIMIT :limit OFFSET :offset'
    );
    $statement->bindValue('id', $topicId, PDO::PARAM_INT);
    $statement->bindValue('limit', $limit, PDO::PARAM_INT);
    $statement->bindValue('offset', $offset, PDO::PARAM_INT);
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * A post with its account, its topic (`TITLE`, `LOCKED`, `CATEGORYID`), whether it starts the
 * topic (`FIRST`) and its place in the topic from 1 (`POSITION`), or null.
 */
function site_find_forum_post(PDO $db, int $postId): ?array
{
    $statement = $db->prepare(
        'SELECT ' . SITE_FORUM_POST_COLUMNS . ', t."TITLE", t."LOCKED", t."CATEGORYID",'
        . ' (SELECT COUNT(*) FROM "LOCAL_FORUM_POSTS" o'
        . ' WHERE o."TOPICID" = p."TOPICID" AND o."ID" <= p."ID") AS "POSITION"'
        . ' FROM "LOCAL_FORUM_POSTS" p'
        . ' JOIN "LOCAL_FORUM_TOPICS" t ON t."ID" = p."TOPICID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = p."USERID"'
        . ' WHERE p."ID" = :id'
    );
    $statement->execute(['id' => $postId]);
    $post = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$post) {
        return null;
    }
    $post['FIRST'] = (int) $post['POSITION'] === 1;
    return $post;
}

/**
 * Opens a topic with its first post.
 *
 * @return int Id of the topic.
 */
function site_insert_forum_topic(PDO $db, int $categoryId, int $userId, string $title, string $text): int
{
    return site_transaction($db, function () use ($db, $categoryId, $userId, $title, $text) {
        $statement = $db->prepare(
            'INSERT INTO "LOCAL_FORUM_TOPICS" ("CATEGORYID", "USERID", "TITLE", "CREATED", "LASTPOSTAT")'
            // A placeholder for each column: PostgreSQL's native prepares bind each name once
            . ' VALUES (:category, :userId, :title, :created, :lastPostAt) RETURNING "ID"'
        );
        $now = time();
        $statement->execute([
            'category' => $categoryId,
            'userId' => $userId,
            'title' => $title,
            'created' => $now,
            'lastPostAt' => $now,
        ]);
        $topicId = (int) $statement->fetchColumn();
        site_insert_forum_post_row($db, $topicId, $userId, $text);
        return $topicId;
    });
}

/**
 * Replies to a topic.
 *
 * @return int Id of the post.
 */
function site_insert_forum_post(PDO $db, int $topicId, int $userId, string $text): int
{
    return site_transaction($db, function () use ($db, $topicId, $userId, $text) {
        return site_insert_forum_post_row($db, $topicId, $userId, $text);
    });
}

/** Inserts a post and counts it on its topic, in the transaction of the caller. */
function site_insert_forum_post_row(PDO $db, int $topicId, int $userId, string $text): int
{
    $now = time();
    $statement = $db->prepare(
        'INSERT INTO "LOCAL_FORUM_POSTS" ("TOPICID", "USERID", "TEXT", "CREATED")'
        . ' VALUES (:topic, :userId, :text, :created) RETURNING "ID"'
    );
    $statement->execute(['topic' => $topicId, 'userId' => $userId, 'text' => $text, 'created' => $now]);
    $postId = (int) $statement->fetchColumn();
    $db->prepare(
        'UPDATE "LOCAL_FORUM_TOPICS" SET "POSTS" = "POSTS" + 1, "LASTPOSTAT" = :now,'
        . ' "LASTPOSTID" = :post WHERE "ID" = :topic'
    )->execute(['now' => $now, 'post' => $postId, 'topic' => $topicId]);

    return $postId;
}

/** Edits a post, keeping its previous version, and the title of its topic when given. */
function site_edit_forum_post(PDO $db, array $post, int $editorId, string $text, ?string $title): void
{
    site_transaction($db, function () use ($db, $post, $editorId, $text, $title) {
        $db->prepare(
            'INSERT INTO "LOCAL_FORUM_EDITS" ("POSTID", "USERID", "TEXT", "CREATED")'
            . ' VALUES (:post, :userId, :text, :created)'
        )->execute([
            'post' => $post['ID'],
            'userId' => $editorId,
            // The title then, kept with the first post
            'text' => $title === null ? $post['TEXT'] : "# {$post['TITLE']}\n\n{$post['TEXT']}",
            'created' => time(),
        ]);
        $db->prepare('UPDATE "LOCAL_FORUM_POSTS" SET "TEXT" = :text, "EDITED" = :now WHERE "ID" = :id')
            ->execute(['text' => $text, 'now' => time(), 'id' => $post['ID']]);
        if ($title !== null) {
            $db->prepare('UPDATE "LOCAL_FORUM_TOPICS" SET "TITLE" = :title WHERE "ID" = :id')
                ->execute(['title' => $title, 'id' => $post['TOPICID']]);
        }
    });
}

/**
 * The previous versions of some posts, the newest first, with the account editing (`EDITOR`).
 *
 * @param int[] $postIds
 * @return array<int, array[]> The versions by post id.
 */
function site_find_forum_edits(PDO $db, array $postIds): array
{
    if (!$postIds) {
        return [];
    }
    $placeholders = implode(', ', array_fill(0, count($postIds), '?'));
    $statement = $db->prepare(
        'SELECT e.*, u."NAME" AS "EDITOR" FROM "LOCAL_FORUM_EDITS" e'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . " WHERE e.\"POSTID\" IN ($placeholders) ORDER BY e.\"ID\" DESC"
    );
    $statement->execute(array_values($postIds));

    $edits = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $edit) {
        $edits[(int) $edit['POSTID']][] = $edit;
    }
    return $edits;
}

/** Deletes a post, with its versions, reports and thumbs up; the first one, with its topic. */
function site_delete_forum_post(PDO $db, array $post): void
{
    if ($post['FIRST']) {
        site_delete_forum_topic($db, (int) $post['TOPICID']);
        return;
    }
    site_transaction($db, function () use ($db, $post) {
        site_delete_forum_posts_by_id($db, [(int) $post['ID']]);
        // The last post and the count of the topic, without it; the subqueries read the topic of
        // the row updated, a placeholder being bound once with PostgreSQL's native prepares
        $db->prepare(
            'UPDATE "LOCAL_FORUM_TOPICS" SET'
            . ' "POSTS" = (SELECT COUNT(*) FROM "LOCAL_FORUM_POSTS" p WHERE p."TOPICID" = "LOCAL_FORUM_TOPICS"."ID"),'
            . ' "LASTPOSTID" = (SELECT MAX(p."ID") FROM "LOCAL_FORUM_POSTS" p WHERE p."TOPICID" = "LOCAL_FORUM_TOPICS"."ID"),'
            . ' "LASTPOSTAT" = (SELECT MAX(p."CREATED") FROM "LOCAL_FORUM_POSTS" p WHERE p."TOPICID" = "LOCAL_FORUM_TOPICS"."ID")'
            . ' WHERE "ID" = :topic'
        )->execute(['topic' => $post['TOPICID']]);
    });
}

/** Deletes a topic with its posts, who read and follows it, and its notifications. */
function site_delete_forum_topic(PDO $db, int $topicId): void
{
    site_transaction($db, function () use ($db, $topicId) {
        $postIds = site_select_ids(
            $db,
            'SELECT "ID" FROM "LOCAL_FORUM_POSTS" WHERE "TOPICID" = :topic',
            ['topic' => $topicId]
        );
        site_delete_forum_posts_by_id($db, $postIds);
        $params = ['topic' => $topicId];
        $db->prepare('DELETE FROM "LOCAL_FORUM_READS" WHERE "TOPICID" = :topic')->execute($params);
        $db->prepare('DELETE FROM "LOCAL_FORUM_WATCHES" WHERE "TOPICID" = :topic')->execute($params);
        site_delete_notifications($db, SITE_NOTIFY_FORUM_REPLY, [$topicId]);
        $db->prepare('DELETE FROM "LOCAL_FORUM_TOPICS" WHERE "ID" = :id')->execute(['id' => $topicId]);
    });
}

/**
 * Deletes posts with their versions, reports and thumbs up, in the transaction of the caller.
 *
 * @param int[] $postIds
 */
function site_delete_forum_posts_by_id(PDO $db, array $postIds): void
{
    if (!$postIds) {
        return;
    }
    $placeholders = implode(', ', array_fill(0, count($postIds), '?'));
    $ids = array_values($postIds);
    $db->prepare("DELETE FROM \"LOCAL_FORUM_EDITS\" WHERE \"POSTID\" IN ($placeholders)")->execute($ids);
    $db->prepare("DELETE FROM \"LOCAL_FORUM_REPORTS\" WHERE \"POSTID\" IN ($placeholders)")->execute($ids);
    $db->prepare(
        "DELETE FROM \"LOCAL_THUMBS\" WHERE \"KIND\" = 'post' AND \"SUBJECTID\" IN ($placeholders)"
    )->execute($ids);
    $db->prepare("DELETE FROM \"LOCAL_FORUM_POSTS\" WHERE \"ID\" IN ($placeholders)")->execute($ids);
}

/**
 * Pins, locks or moves a topic.
 *
 * @param string $column `PINNED`, `LOCKED` or `CATEGORYID`.
 */
function site_set_forum_topic(PDO $db, int $topicId, string $column, int $value): void
{
    if (!in_array($column, ['PINNED', 'LOCKED', 'CATEGORYID'], true)) {
        throw new InvalidArgumentException("Not a column of the topics to set: $column");
    }
    $db->prepare("UPDATE \"LOCAL_FORUM_TOPICS\" SET \"$column\" = :value WHERE \"ID\" = :id")
        ->execute(['value' => $value, 'id' => $topicId]);
}

/** Reports a post, an account reporting it once: a new report replaces its previous one. */
function site_report_forum_post(PDO $db, int $postId, int $userId, string $reason): void
{
    site_transaction($db, function () use ($db, $postId, $userId, $reason) {
        $params = ['post' => $postId, 'userId' => $userId];
        $db->prepare('DELETE FROM "LOCAL_FORUM_REPORTS" WHERE "POSTID" = :post AND "USERID" = :userId')
            ->execute($params);
        $db->prepare(
            'INSERT INTO "LOCAL_FORUM_REPORTS" ("POSTID", "USERID", "REASON", "CREATED")'
            . ' VALUES (:post, :userId, :reason, :created)'
        )->execute($params + ['reason' => $reason, 'created' => time()]);
    });
}

/**
 * The reported posts, the most reported first, with their topic and their reports (`REPORTS`,
 * each with its `REASON`, `REPORTER` and `CREATED`).
 */
function site_find_forum_reports(PDO $db): array
{
    $posts = $db->query(
        'SELECT p."ID", p."TEXT", p."TOPICID", t."TITLE", u."NAME" AS "AUTHOR", COUNT(*) AS "COUNT"'
        . ' FROM "LOCAL_FORUM_REPORTS" r'
        . ' JOIN "LOCAL_FORUM_POSTS" p ON p."ID" = r."POSTID"'
        . ' JOIN "LOCAL_FORUM_TOPICS" t ON t."ID" = p."TOPICID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = p."USERID"'
        . ' GROUP BY p."ID", p."TEXT", p."TOPICID", t."TITLE", u."NAME"'
        . ' ORDER BY COUNT(*) DESC, p."ID"'
    )->fetchAll(PDO::FETCH_ASSOC);

    $reports = $db->prepare(
        'SELECT r."REASON", r."CREATED", u."NAME" AS "REPORTER" FROM "LOCAL_FORUM_REPORTS" r'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = r."USERID" WHERE r."POSTID" = :post ORDER BY r."CREATED"'
    );
    foreach ($posts as &$post) {
        $reports->execute(['post' => $post['ID']]);
        $post['REPORTS'] = $reports->fetchAll(PDO::FETCH_ASSOC);
    }
    return $posts;
}

/** Drops the reports of a post. */
function site_dismiss_forum_reports(PDO $db, int $postId): void
{
    $db->prepare('DELETE FROM "LOCAL_FORUM_REPORTS" WHERE "POSTID" = :post')->execute(['post' => $postId]);
}

/**
 * Forgets an account deleted, in the transaction of the caller: its posts stay without their
 * text nor previous versions, so that the topics still read, and its reports go.
 */
function site_forget_user_forum(PDO $db, int $userId): void
{
    $params = ['userId' => $userId];
    $db->prepare(
        'DELETE FROM "LOCAL_FORUM_EDITS" WHERE "POSTID" IN'
        . ' (SELECT "ID" FROM "LOCAL_FORUM_POSTS" WHERE "USERID" = :userId)'
    )->execute($params);
    $db->prepare('UPDATE "LOCAL_FORUM_EDITS" SET "USERID" = NULL WHERE "USERID" = :userId')->execute($params);
    $db->prepare('UPDATE "LOCAL_FORUM_POSTS" SET "USERID" = NULL, "TEXT" = \'\' WHERE "USERID" = :userId')
        ->execute($params);
    $db->prepare('UPDATE "LOCAL_FORUM_TOPICS" SET "USERID" = NULL WHERE "USERID" = :userId')->execute($params);
    $db->prepare('DELETE FROM "LOCAL_FORUM_REPORTS" WHERE "USERID" = :userId')->execute($params);
    $db->prepare('DELETE FROM "LOCAL_FORUM_READS" WHERE "USERID" = :userId')->execute($params);
    $db->prepare('DELETE FROM "LOCAL_FORUM_WATCHES" WHERE "USERID" = :userId')->execute($params);
}

/**
 * The published tracks and the ghosts out of review that posts link to, for their cards.
 *
 * @param int[] $trackIds
 * @param int[] $ghostIds
 * @return array{tracks: array<int, array>, ghosts: array<int, array>} By id: a track with its
 *   `TITLE` and `AUTHOR`, a ghost with its `TRACKID`, `TITLE`, `TIME` and `RIDER`.
 */
function site_find_forum_embeds(PDO $db, array $trackIds, array $ghostIds): array
{
    $embeds = ['tracks' => [], 'ghosts' => []];
    if ($trackIds) {
        $placeholders = implode(', ', array_fill(0, count($trackIds), '?'));
        $statement = $db->prepare(
            'SELECT t."ID", d."TITLE", u."NAME" AS "AUTHOR" FROM "TRACKS" t'
            . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = t."ID"'
            . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = d."USERID"'
            . " WHERE t.\"ID\" IN ($placeholders)"
        );
        $statement->execute(array_values($trackIds));
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $track) {
            $embeds['tracks'][(int) $track['ID']] = $track;
        }
    }
    if ($ghostIds) {
        $placeholders = implode(', ', array_fill(0, count($ghostIds), '?'));
        $statement = $db->prepare(
            'SELECT g."ID", g."TRACKID", g."TIME", d."TITLE", u."NAME" AS "RIDER" FROM "GHOSTS" g'
            . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
            . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
            . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
            . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
            . " WHERE g.\"ID\" IN ($placeholders) AND r.\"GHOSTID\" IS NULL"
        );
        $statement->execute(array_values($ghostIds));
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $ghost) {
            $embeds['ghosts'][(int) $ghost['ID']] = $ghost;
        }
    }
    return $embeds;
}

/**
 * Saves a category, new without id.
 *
 * @param array{SLUG?: string, NAME: string, DESCRIPTION: string, POSITION: int, STAFFONLY: bool} $fields
 *   The slug only for a new category.
 */
function site_save_forum_category(PDO $db, ?int $categoryId, array $fields): void
{
    $params = [
        'name' => $fields['NAME'],
        'description' => $fields['DESCRIPTION'],
        'position' => $fields['POSITION'],
        'staffOnly' => (int) $fields['STAFFONLY'],
    ];
    if ($categoryId === null) {
        $db->prepare(
            'INSERT INTO "LOCAL_FORUM_CATEGORIES" ("SLUG", "NAME", "DESCRIPTION", "POSITION", "STAFFONLY")'
            . ' VALUES (:slug, :name, :description, :position, :staffOnly)'
        )->execute($params + ['slug' => $fields['SLUG']]);
        return;
    }
    $db->prepare(
        'UPDATE "LOCAL_FORUM_CATEGORIES" SET "NAME" = :name, "DESCRIPTION" = :description,'
        . ' "POSITION" = :position, "STAFFONLY" = :staffOnly WHERE "ID" = :id'
    )->execute($params + ['id' => $categoryId]);
}

/** Deletes a category without topics. */
function site_delete_forum_category(PDO $db, int $categoryId): void
{
    $db->prepare('DELETE FROM "LOCAL_FORUM_CATEGORIES" WHERE "ID" = :id')->execute(['id' => $categoryId]);
}

/**
 * The account reading the forum, as the parameters of the queries telling what it has to read
 * (`:reader` and `:since`), or null without account: nothing is unread then.
 */
function site_forum_reader(?array $user): ?array
{
    return $user === null ? null : ['reader' => $user['ID'], 'since' => site_forum_read_since($user)];
}

/**
 * Time before which every post is read for an account: when it marked the whole forum read, else
 * when it was created, the posts from before being no news to it. 0 for the accounts from before
 * their creation times, to which every post is new until they mark the forum read.
 */
function site_forum_read_since(array $user): int
{
    return (int) ($user['FORUMREADAT'] ?? $user['CREATED'] ?? 0);
}

/** Last post of a topic an account read, 0 when it never opened it. */
function site_find_forum_read(PDO $db, int $userId, int $topicId): int
{
    $statement = $db->prepare(
        'SELECT "POSTID" FROM "LOCAL_FORUM_READS" WHERE "USERID" = :userId AND "TOPICID" = :topic'
    );
    $statement->execute(['userId' => $userId, 'topic' => $topicId]);

    return (int) $statement->fetchColumn();
}

/** Marks a topic read by an account up to a post, never back to an older one. */
function site_mark_forum_read(PDO $db, int $userId, int $topicId, int $postId): void
{
    // An upsert of SQLite and PostgreSQL alike
    $db->prepare(
        'INSERT INTO "LOCAL_FORUM_READS" ("USERID", "TOPICID", "POSTID") VALUES (:userId, :topic, :post)'
        . ' ON CONFLICT ("USERID", "TOPICID") DO UPDATE SET "POSTID" = excluded."POSTID"'
        . ' WHERE "LOCAL_FORUM_READS"."POSTID" < excluded."POSTID"'
    )->execute(['userId' => $userId, 'topic' => $topicId, 'post' => $postId]);
}

/**
 * Marks the whole forum read by an account: the posts until now are read, its read positions,
 * all older, are no longer needed.
 */
function site_mark_forum_all_read(PDO $db, int $userId): void
{
    site_transaction($db, function () use ($db, $userId) {
        $db->prepare('UPDATE "LOCAL_USERS" SET "FORUMREADAT" = :now WHERE "ID" = :userId')
            ->execute(['now' => time(), 'userId' => $userId]);
        $db->prepare('DELETE FROM "LOCAL_FORUM_READS" WHERE "USERID" = :userId')
            ->execute(['userId' => $userId]);
    });
}

/** The first post of a topic unread by an account, null when it read them all. */
function site_find_forum_first_unread(PDO $db, int $topicId, int $lastRead, int $since): ?int
{
    $statement = $db->prepare(
        'SELECT MIN("ID") FROM "LOCAL_FORUM_POSTS"'
        . ' WHERE "TOPICID" = :topic AND "ID" > :lastRead AND "CREATED" > :since'
    );
    $statement->execute(['topic' => $topicId, 'lastRead' => $lastRead, 'since' => $since]);
    $postId = $statement->fetchColumn();

    return $postId === null || $postId === false ? null : (int) $postId;
}

/** Whether an account follows a topic: true or false as it chose, null when it never did. */
function site_find_forum_watch(PDO $db, int $userId, int $topicId): ?bool
{
    $statement = $db->prepare(
        'SELECT "WATCHING" FROM "LOCAL_FORUM_WATCHES" WHERE "USERID" = :userId AND "TOPICID" = :topic'
    );
    $statement->execute(['userId' => $userId, 'topic' => $topicId]);
    $watching = $statement->fetchColumn();

    return $watching === false ? null : (bool) $watching;
}

/**
 * Follows a topic, or stops following it, for an account.
 *
 * @param bool $unlessChosen Whether its previous choice is kept, e.g. replying again to a topic
 *   it stopped following.
 */
function site_set_forum_watch(PDO $db, int $userId, int $topicId, bool $watching, bool $unlessChosen = false): void
{
    $db->prepare(
        'INSERT INTO "LOCAL_FORUM_WATCHES" ("USERID", "TOPICID", "WATCHING") VALUES (:userId, :topic, :watching)'
        . ' ON CONFLICT ("USERID", "TOPICID") DO '
        . ($unlessChosen ? 'NOTHING' : 'UPDATE SET "WATCHING" = excluded."WATCHING"')
    )->execute(['userId' => $userId, 'topic' => $topicId, 'watching' => (int) $watching]);
}

/**
 * The accounts following a topic.
 *
 * @return int[]
 */
function site_find_forum_watchers(PDO $db, int $topicId): array
{
    return site_select_ids(
        $db,
        'SELECT "USERID" FROM "LOCAL_FORUM_WATCHES" WHERE "TOPICID" = :topic AND "WATCHING" = 1',
        ['topic' => $topicId]
    );
}

/**
 * Condition and parameters of the posts holding every word searched, the first post of a topic
 * also by its title: the posts `p` of the topics `t`, without the text of the deleted accounts.
 *
 * @param string[] $words Words or phrases, in lowercase.
 * @return array{0: string, 1: array}
 */
function site_forum_search_condition(array $words, ?int $categoryId): array
{
    $conditions = ['p."TEXT" <> \'\''];
    $params = [];
    foreach (array_values($words) as $index => $word) {
        // A placeholder each, PDO not taking the same twice without emulating the statements
        $params["text$index"] = site_like_pattern($word);
        $params["title$index"] = site_like_pattern($word);
        $conditions[] = "(LOWER(p.\"TEXT\") LIKE :text$index ESCAPE '!'"
            . " OR (LOWER(t.\"TITLE\") LIKE :title$index ESCAPE '!' AND p.\"ID\" ="
            . ' (SELECT MIN(o."ID") FROM "LOCAL_FORUM_POSTS" o WHERE o."TOPICID" = p."TOPICID")))';
    }
    if ($categoryId !== null) {
        $conditions[] = 't."CATEGORYID" = :category';
        $params['category'] = $categoryId;
    }
    return [implode(' AND ', $conditions), $params];
}

/** Number of posts found by a search, see site_forum_search_condition(). */
function site_count_forum_search(PDO $db, array $words, ?int $categoryId): int
{
    [$condition, $params] = site_forum_search_condition($words, $categoryId);
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_FORUM_POSTS" p JOIN "LOCAL_FORUM_TOPICS" t ON t."ID" = p."TOPICID"'
        . " WHERE $condition"
    );
    $statement->execute($params);

    return (int) $statement->fetchColumn();
}

/**
 * A page of the posts found by a search, the newest first, with their account (`AUTHOR`), topic
 * (`TITLE`) and category (`SLUG`, `CATEGORY`), see site_forum_search_condition().
 */
function site_search_forum(PDO $db, array $words, ?int $categoryId, int $offset, int $limit): array
{
    [$condition, $params] = site_forum_search_condition($words, $categoryId);
    $statement = $db->prepare(
        'SELECT p."ID", p."TOPICID", p."TEXT", p."CREATED", u."NAME" AS "AUTHOR", t."TITLE",'
        . ' c."SLUG", c."NAME" AS "CATEGORY"'
        . ' FROM "LOCAL_FORUM_POSTS" p'
        . ' JOIN "LOCAL_FORUM_TOPICS" t ON t."ID" = p."TOPICID"'
        . ' JOIN "LOCAL_FORUM_CATEGORIES" c ON c."ID" = t."CATEGORYID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = p."USERID"'
        . " WHERE $condition ORDER BY p.\"ID\" DESC LIMIT :limit OFFSET :offset"
    );
    foreach ($params as $name => $value) {
        $statement->bindValue($name, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $statement->bindValue('limit', $limit, PDO::PARAM_INT);
    $statement->bindValue('offset', $offset, PDO::PARAM_INT);
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}
