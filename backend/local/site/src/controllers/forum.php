<?php

/**
 * Forum of the site (`/forum/`): categories, their topics, and the posts of the topics, the first
 * one opening the topic.
 *
 * Everyone reads it; the accounts logged in and not suspended open topics (but in the categories
 * for the staff, see `STAFFONLY`), reply, like and report the posts. An account edits its own
 * posts, without time limit, unless the topic is locked; the moderators edit, delete, pin, lock
 * and move anything, and read the previous versions of the posts edited. The reported posts wait
 * for them on `/reviews/`. The admins manage the categories (`/admin/forum/`).
 *
 * The posts are written in a small part of Markdown (see forum-format.php), previewed while
 * written by `forum-editor.js` with the same formatting (`POST /forum/preview/`).
 *
 * Each account sees what it did not read yet: the topics with new posts, and in a topic the first
 * post new to it (see site_forum_reader()). It follows the topics it opens or replies to, unless
 * it stopped following them, and is told of their replies (see db/notifications.php). The posts
 * are searched by their words (`/forum/search/`).
 */

/** Topics listed per page of a category, and posts per page of a topic. */
const SITE_FORUM_TOPICS_PER_PAGE = 30,
    SITE_FORUM_POSTS_PER_PAGE = 20;

/** Length of the titles of the topics, and of the posts, in characters. */
const SITE_FORUM_TITLE_MIN = 3,
    SITE_FORUM_TITLE_MAX = 100,
    SITE_FORUM_POST_MAX = 10000;

/** Age of an account before it opens topics, in seconds: a brake on the accounts of spammers. */
const SITE_FORUM_TOPIC_MIN_AGE = 600;

/** Slugs of categories that would be routes of the forum. */
const SITE_FORUM_RESERVED_SLUGS = ['topics', 'posts', 'preview', 'search', 'read'];

/** Posts listed per page of a search, and characters of a search at most. */
const SITE_FORUM_RESULTS_PER_PAGE = 20,
    SITE_FORUM_SEARCH_MAX = 100;

/** The categories, with their last topic. */
function site_forum_page(): void
{
    $user = site_user();
    site_render_page('forum', 'Forum', [
        'categories' => site_find_forum_categories(site_db(), site_forum_reader($user)),
        'user' => $user,
    ], ['forum.css']);
}

/** A page of the topics of a category, the pinned ones first, then by their last post. */
function site_forum_category_page(string $slug): void
{
    $db = site_db();
    $category = site_find_forum_category($db, $slug);
    if ($category === null) {
        site_not_found();
        return;
    }
    $count = site_count_forum_topics($db, (int) $category['ID']);
    $pages = max(1, (int) ceil($count / SITE_FORUM_TOPICS_PER_PAGE));
    $page = min($pages, max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT)));

    site_render_page('forum-category', $category['NAME'], [
        'category' => $category,
        'topics' => site_find_forum_topics(
            $db,
            (int) $category['ID'],
            ($page - 1) * SITE_FORUM_TOPICS_PER_PAGE,
            SITE_FORUM_TOPICS_PER_PAGE,
            true,
            site_forum_reader(site_user())
        ),
        'page' => $page,
        'pages' => $pages,
        'canOpen' => site_forum_can_open_topic(site_user(), $category) === null,
    ], ['forum.css']);
}

/** Why an account cannot open a topic in a category, null when it can. */
function site_forum_can_open_topic(?array $user, array $category): ?string
{
    if ($user === null) {
        return 'Log in to open a topic.';
    }
    if (site_is_suspended($user)) {
        return site_suspension_message($user);
    }
    if ($category['STAFFONLY'] && !site_can($user, 'moderate')) {
        return 'Only the moderators open topics in this category.';
    }
    $created = $user['CREATED'] ?? null;
    if ($created !== null && time() - (int) $created < SITE_FORUM_TOPIC_MIN_AGE) {
        return 'New accounts open topics after ' . intdiv(SITE_FORUM_TOPIC_MIN_AGE, 60)
            . ' minutes: reply to the others meanwhile.';
    }
    return null;
}

/** Why the text of a post is refused, null when valid. */
function site_forum_check_text(string $text): ?string
{
    // Counts characters, not bytes; invalid UTF-8 does not match either
    return preg_match('/^.{1,' . SITE_FORUM_POST_MAX . '}$/su', $text) && trim($text) !== ''
        ? null
        : 'Write between 1 and ' . SITE_FORUM_POST_MAX . ' characters.';
}

/** Why the title of a topic is refused, null when valid. */
function site_forum_check_title(string $title): ?string
{
    return preg_match('/^[^\n]{' . SITE_FORUM_TITLE_MIN . ',' . SITE_FORUM_TITLE_MAX . '}$/u', $title)
        ? null
        : 'Titles have ' . SITE_FORUM_TITLE_MIN . ' to ' . SITE_FORUM_TITLE_MAX . ' characters.';
}

/** The form opening a topic in a category, and its posting. */
function site_forum_new_topic(string $slug): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $category = site_find_forum_category($db, $slug);
    if ($category === null) {
        site_not_found();
        return;
    }
    $refusal = site_forum_can_open_topic($user, $category);
    if ($refusal !== null) {
        http_response_code(403);
        site_render_message('No new topic here', $refusal);
        return;
    }

    $title = '';
    $text = '';
    $errors = [];
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        if (!site_check_posted_form()) {
            return;
        }
        $title = site_form_text('title');
        $text = site_form_text('text');
        $errors = array_filter([
            'title' => site_forum_check_title($title),
            'text' => site_forum_check_text($text),
        ]);
        if (!$errors && !site_take_rate_limit($db, 'forum-topic', (string) $user['ID'])) {
            $errors['form'] = 'Too many topics opened, try again later.';
        }
        if (!$errors) {
            $topicId = site_insert_forum_topic($db, (int) $category['ID'], $user['ID'], $title, $text);
            // Followed by its account, and read up to its post
            site_set_forum_watch($db, $user['ID'], $topicId, true);
            site_mark_forum_read($db, $user['ID'], $topicId, (int) site_find_forum_topic($db, $topicId)['LASTPOSTID']);
            site_redirect("/forum/topics/$topicId/");
            return;
        }
        http_response_code(422);
    }

    site_render_page('forum-post-form', 'New topic', [
        'heading' => 'New topic in ' . $category['NAME'],
        'action' => '/forum/' . $category['SLUG'] . '/new/',
        'back' => '/forum/' . $category['SLUG'] . '/',
        'withTitle' => true,
        'title' => $title,
        'text' => $text,
        'errors' => $errors,
        'submit' => 'Open the topic',
    ], ['forum.css'], ['/assets/js/forum-editor.js']);
}

/**
 * A page of the posts of a topic (`?page=`, a number or `last`), with the form of a reply, filled
 * with a quote of a post with `?quote=<id>`.
 *
 * @param string  $draft Reply sent but refused, written again in the form.
 * @param ?string $error Why it was refused.
 */
function site_forum_topic_page(int $topicId, string $draft = '', ?string $error = null): void
{
    $db = site_db();
    $topic = site_find_forum_topic($db, $topicId);
    if ($topic === null) {
        site_not_found();
        return;
    }
    $user = site_user();
    $moderator = site_can($user, 'moderate');

    $pages = max(1, (int) ceil((int) $topic['POSTS'] / SITE_FORUM_POSTS_PER_PAGE));
    $requested = $_GET['page'] ?? 1;
    $page = $requested === 'last'
        ? $pages
        : min($pages, max(1, (int) filter_var($requested, FILTER_VALIDATE_INT)));
    $posts = site_find_forum_posts($db, $topicId, ($page - 1) * SITE_FORUM_POSTS_PER_PAGE, SITE_FORUM_POSTS_PER_PAGE);
    $postIds = array_map('intval', array_column($posts, 'ID'));
    [$trackIds, $ghostIds] = site_forum_embed_ids(array_column($posts, 'TEXT'));

    // The first post of the page new to the account, then the page read, with the notifications
    // of its replies
    $unreadFrom = null;
    if ($user !== null && $postIds) {
        $lastRead = site_find_forum_read($db, $user['ID'], $topicId);
        $since = site_forum_read_since($user);
        foreach ($posts as $post) {
            if ((int) $post['ID'] > $lastRead && (int) $post['CREATED'] > $since) {
                $unreadFrom = (int) $post['ID'];
                break;
            }
        }
        site_mark_forum_read($db, $user['ID'], $topicId, max($postIds));
        site_mark_notifications_seen_about($db, $user['ID'], SITE_NOTIFY_FORUM_REPLY, [$topicId], max($postIds));
    }

    // The quote of a post of the topic, in the reply
    $quoted = isset($_GET['quote']) ? site_find_forum_post($db, (int) $_GET['quote']) : null;
    if ($draft === '' && $quoted !== null && (int) $quoted['TOPICID'] === $topicId && $quoted['TEXT'] !== '') {
        $lines = preg_split('/\R/u', $quoted['TEXT']) ?: [];
        $draft = '> @' . ($quoted['AUTHOR'] ?? 'Deleted account') . " wrote:\n"
            . implode("\n", array_map(fn (string $line) => "> $line", $lines)) . "\n\n";
    }

    site_render_page('forum-topic', $topic['TITLE'], [
        'topic' => $topic,
        'posts' => $posts,
        'page' => $page,
        'pages' => $pages,
        'embeds' => site_find_forum_embeds($db, $trackIds, $ghostIds),
        'edits' => $moderator ? site_find_forum_edits($db, $postIds) : [],
        'thumbed' => $user === null ? [] : site_find_thumbed($db, 'post', $user['ID'], $postIds),
        'moderator' => $moderator,
        'categories' => $moderator ? site_find_forum_categories($db) : [],
        'canReply' => $user !== null && !site_is_suspended($user) && (!$topic['LOCKED'] || $moderator),
        'unreadFrom' => $unreadFrom,
        'watching' => $user !== null && site_find_forum_watch($db, $user['ID'], $topicId) === true,
        'draft' => $draft,
        'error' => $error,
        'reported' => isset($_GET['reported']),
    ], ['forum.css'], ['/assets/js/thumbs.js', '/assets/js/forum-editor.js']);
}

/** Posts a reply to a topic, then opens it there. */
function site_forum_reply(int $topicId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $topic = site_find_forum_topic($db, $topicId);
    if ($topic === null) {
        site_not_found();
        return;
    }
    if ($topic['LOCKED'] && !site_can($user, 'moderate')) {
        http_response_code(403);
        site_render_message('Topic locked', 'This topic no longer takes replies.');
        return;
    }

    $text = site_form_text('text');
    $error = site_forum_check_text($text);
    if ($error === null && !site_take_rate_limit($db, 'forum-post', (string) $user['ID'])) {
        $error = 'Too many posts, try again later.';
    }
    if ($error !== null) {
        http_response_code(422);
        $_GET['page'] = 'last';
        site_forum_topic_page($topicId, $text, $error);
        return;
    }

    $postId = site_insert_forum_post($db, $topicId, $user['ID'], $text);
    // The accounts following the topic are told, then its account follows it, unless it chose not
    site_notify($db, site_find_forum_watchers($db, $topicId), SITE_NOTIFY_FORUM_REPLY, $topicId, $postId, $user['ID']);
    site_set_forum_watch($db, $user['ID'], $topicId, true, true);
    site_mark_forum_read($db, $user['ID'], $topicId, $postId);
    site_forum_post_redirect($postId);
}

/** Opens a topic on its first post new to the account, else on its last post. */
function site_forum_unread(int $topicId): void
{
    $db = site_db();
    $topic = site_find_forum_topic($db, $topicId);
    if ($topic === null) {
        site_not_found();
        return;
    }
    $user = site_user();
    $postId = $user === null ? null : site_find_forum_first_unread(
        $db,
        $topicId,
        site_find_forum_read($db, $user['ID'], $topicId),
        site_forum_read_since($user)
    );
    site_forum_post_redirect($postId ?? (int) $topic['LASTPOSTID']);
}

/** Follows a topic, or stops following it, for the account, then back to its page. */
function site_forum_watch(int $topicId, bool $watching): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    if (site_find_forum_topic($db, $topicId) === null) {
        site_not_found();
        return;
    }
    site_set_forum_watch($db, $user['ID'], $topicId, $watching);
    $page = max(1, (int) ($_POST['page'] ?? 1));
    site_redirect("/forum/topics/$topicId/" . ($page > 1 ? "?page=$page" : ''));
}

/** Marks the whole forum read by the account, with the notifications of its replies. */
function site_forum_read_all(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    site_mark_forum_all_read($db, $user['ID']);
    site_mark_notifications_seen($db, $user['ID'], SITE_NOTIFY_FORUM_REPLY);
    site_redirect('/forum/');
}

/**
 * The posts holding every word searched (`q`, words or "phrases", see site_forum_search_words()),
 * the newest first, in a category (`category`, its slug) or in the whole forum, by pages.
 */
function site_forum_search_page(): void
{
    $db = site_db();
    $user = site_user();
    $query = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    // Invalid UTF-8 searches nothing
    $query = preg_match('//u', $query) ? mb_substr($query, 0, SITE_FORUM_SEARCH_MAX, 'UTF-8') : '';
    $slug = is_string($_GET['category'] ?? null) ? $_GET['category'] : '';
    $category = $slug === '' ? null : site_find_forum_category($db, $slug);
    $words = site_forum_search_words($query);

    $results = [];
    $count = 0;
    $page = 1;
    $pages = 1;
    $error = null;
    if ($query !== '' && !$words) {
        $error = 'Search for words of 2 characters or more.';
    } elseif ($words) {
        $subject = $user === null ? site_client_address() : 'user:' . $user['ID'];
        if (!site_take_rate_limit($db, 'forum-search', $subject)) {
            http_response_code(429);
            $error = 'Too many searches, try again in a few minutes.';
        } else {
            $categoryId = $category === null ? null : (int) $category['ID'];
            $count = site_count_forum_search($db, $words, $categoryId);
            $pages = max(1, (int) ceil($count / SITE_FORUM_RESULTS_PER_PAGE));
            $page = min($pages, max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT)));
            $results = site_search_forum(
                $db,
                $words,
                $categoryId,
                ($page - 1) * SITE_FORUM_RESULTS_PER_PAGE,
                SITE_FORUM_RESULTS_PER_PAGE
            );
        }
    }

    site_render_page('forum-search', $query === '' ? 'Search the forum' : "Search: $query", [
        'query' => $query,
        'words' => $words,
        'category' => $category,
        'categories' => site_find_forum_categories($db),
        'results' => $results,
        'count' => $count,
        'page' => $page,
        'pages' => $pages,
        'error' => $error,
    ], ['forum.css']);
}

/** Opens the page of the topic of a post, on the post. */
function site_forum_post_redirect(int $postId): void
{
    $post = site_find_forum_post(site_db(), $postId);
    if ($post === null) {
        site_not_found();
        return;
    }
    $page = (int) ceil((int) $post['POSITION'] / SITE_FORUM_POSTS_PER_PAGE);
    site_redirect('/forum/topics/' . (int) $post['TOPICID'] . '/' . ($page > 1 ? "?page=$page" : '') . "#post-$postId");
}

/** Whether an account edits a post: its own while the topic is open, or any for the moderators. */
function site_forum_can_edit(?array $user, array $post): bool
{
    if ($user === null || $post['TEXT'] === '' || site_is_suspended($user)) {
        return false;
    }
    if (site_can($user, 'moderate')) {
        return true;
    }
    return $post['USERID'] !== null && (int) $post['USERID'] === $user['ID'] && !$post['LOCKED'];
}

/** The form editing a post, and the title of its topic for the first one, and its posting. */
function site_forum_edit(int $postId): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $post = site_find_forum_post($db, $postId);
    if ($post === null || !site_forum_can_edit($user, $post)) {
        site_not_found();
        return;
    }

    $title = $post['TITLE'];
    $text = $post['TEXT'];
    $errors = [];
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        if (!site_check_posted_form()) {
            return;
        }
        $text = site_form_text('text');
        $title = $post['FIRST'] ? site_form_text('title') : $post['TITLE'];
        $errors = array_filter([
            'title' => $post['FIRST'] ? site_forum_check_title($title) : null,
            'text' => site_forum_check_text($text),
        ]);
        if (!$errors && !site_take_rate_limit($db, 'forum-edit', (string) $user['ID'])) {
            $errors['form'] = 'Too many edits, try again later.';
        }
        if (!$errors) {
            if ($text !== $post['TEXT'] || $title !== $post['TITLE']) {
                site_edit_forum_post($db, $post, $user['ID'], $text, $post['FIRST'] ? $title : null);
                if ((int) $post['USERID'] !== $user['ID']) {
                    site_audit($db, $user, 'edit', "forum post #$postId", 'in topic #' . (int) $post['TOPICID']);
                }
            }
            site_forum_post_redirect($postId);
            return;
        }
        http_response_code(422);
    }

    site_render_page('forum-post-form', 'Edit', [
        'heading' => $post['FIRST'] ? 'Edit the topic' : 'Edit the post',
        'action' => "/forum/posts/$postId/edit/",
        'back' => "/forum/posts/$postId/",
        'withTitle' => $post['FIRST'],
        'title' => $title,
        'text' => $text,
        'errors' => $errors,
        'submit' => 'Save',
    ], ['forum.css'], ['/assets/js/forum-editor.js']);
}

/** Deletes a post, the first one with its topic, for the moderators. */
function site_forum_post_delete(int $postId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $post = site_find_forum_post($db, $postId);
    if ($post === null || !site_can($user, 'moderate')) {
        site_not_found();
        return;
    }

    $category = site_find_forum_category_by_id($db, (int) $post['CATEGORYID']);
    site_delete_forum_post($db, $post);
    if ($post['FIRST']) {
        site_audit($db, $user, 'delete', 'forum topic #' . (int) $post['TOPICID'], $post['TITLE']);
        site_redirect('/forum/' . ($category === null ? '' : $category['SLUG'] . '/'));
        return;
    }
    site_audit(
        $db,
        $user,
        'delete',
        "forum post #$postId",
        'in topic #' . (int) $post['TOPICID'] . ': ' . mb_substr($post['TEXT'], 0, 80, 'UTF-8')
    );
    site_redirect('/forum/topics/' . (int) $post['TOPICID'] . '/?page=last');
}

/** Reports a post of another account to the moderators, with a reason. */
function site_forum_post_report(int $postId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $post = site_find_forum_post($db, $postId);
    if ($post === null || $post['TEXT'] === '' || (int) $post['USERID'] === $user['ID']) {
        site_not_found();
        return;
    }

    $reason = site_form_text('reason');
    if (!preg_match('/^.{1,' . SITE_REPORT_REASON_MAX . '}$/su', $reason)) {
        http_response_code(422);
        site_render_message(
            'Report not sent',
            'Tell the moderators in a few words what is wrong, in at most ' . SITE_REPORT_REASON_MAX . ' characters.'
        );
        return;
    }
    if (!site_take_rate_limit($db, 'report', (string) $user['ID'])) {
        http_response_code(429);
        site_render_message('Report not sent', 'Too many reports, try again later.');
        return;
    }

    site_report_forum_post($db, $postId, $user['ID'], $reason);
    site_notify_review(
        $db,
        "{$user['NAME']} reported a post of " . ($post['AUTHOR'] ?? 'a deleted account')
        . " in \"{$post['TITLE']}\": $reason",
        "/forum/posts/$postId/"
    );
    $page = (int) ceil((int) $post['POSITION'] / SITE_FORUM_POSTS_PER_PAGE);
    site_redirect('/forum/topics/' . (int) $post['TOPICID'] . "/?page=$page&reported=1#post-$postId");
}

/**
 * Pins, unpins, locks, unlocks or moves (`category`, its id) a topic, for the moderators.
 *
 * @param string $action `pin`, `unpin`, `lock`, `unlock` or `move`.
 */
function site_forum_topic_action(int $topicId, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $topic = site_find_forum_topic($db, $topicId);
    if ($topic === null || !site_can($user, 'moderate')) {
        site_not_found();
        return;
    }

    $details = '';
    if ($action === 'move') {
        $category = site_find_forum_category_by_id($db, (int) ($_POST['category'] ?? 0));
        if ($category === null) {
            site_not_found();
            return;
        }
        site_set_forum_topic($db, $topicId, 'CATEGORYID', (int) $category['ID']);
        $details = "from {$topic['CATEGORY']} to {$category['NAME']}";
    } else {
        $column = in_array($action, ['pin', 'unpin'], true) ? 'PINNED' : 'LOCKED';
        site_set_forum_topic($db, $topicId, $column, in_array($action, ['pin', 'lock'], true) ? 1 : 0);
    }
    site_audit($db, $user, $action, "forum topic #$topicId", $details === '' ? $topic['TITLE'] : $details);
    site_redirect("/forum/topics/$topicId/");
}

/** HTML of a post being written, as it will show, for the preview of the editor. Answers JSON. */
function site_forum_preview(): void
{
    $user = site_user();
    if ($user === null) {
        openrider_respond(401, ['error' => 'Log in to write']);
    }
    if (!site_check_csrf()) {
        openrider_respond(403, ['error' => 'The page has expired']);
    }
    $db = site_db();
    if (!site_take_rate_limit($db, 'forum-preview', (string) $user['ID'])) {
        openrider_respond(429, ['error' => 'Too many previews']);
    }
    $text = mb_substr(site_form_text('text'), 0, SITE_FORUM_POST_MAX, 'UTF-8');
    [$trackIds, $ghostIds] = site_forum_embed_ids([$text]);
    openrider_respond(200, ['html' => site_forum_format($text, site_find_forum_embeds($db, $trackIds, $ghostIds))]);
}

/** The categories of the forum, edited by the admins. */
function site_admin_forum_page(?string $error = null): void
{
    if (site_require_admin() === null) {
        return;
    }
    if ($error !== null) {
        http_response_code(422);
    }
    site_render_page('admin-forum', 'Forum categories', [
        'categories' => site_find_forum_categories(site_db()),
        'error' => $error,
    ], ['users.css', 'forum.css']);
}

/**
 * Saves a category (`save`, or `new` with its `slug`), or deletes one without topics (`delete`),
 * for the admins.
 */
function site_admin_forum_category(?int $categoryId, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $admin = site_require_admin();
    if ($admin === null) {
        return;
    }
    $db = site_db();
    $category = $categoryId === null ? null : site_find_forum_category_by_id($db, $categoryId);
    if ($categoryId !== null && $category === null) {
        site_not_found();
        return;
    }

    if ($action === 'delete') {
        if (site_count_forum_topics($db, $categoryId) > 0) {
            site_admin_forum_page('Move or delete its topics before deleting the category.');
            return;
        }
        site_delete_forum_category($db, $categoryId);
        site_audit($db, $admin, 'delete', 'forum category ' . $category['NAME']);
        site_redirect('/admin/forum/');
        return;
    }

    $fields = [
        'NAME' => site_form_text('name'),
        'DESCRIPTION' => site_form_text('description'),
        'POSITION' => (int) ($_POST['position'] ?? 0),
        'STAFFONLY' => isset($_POST['staffOnly']),
    ];
    if (!preg_match('/^[^\n]{1,40}$/u', $fields['NAME']) || !preg_match('/^[^\n]{0,200}$/u', $fields['DESCRIPTION'])) {
        site_admin_forum_page('A category has a name of 1 to 40 characters and a description of at most 200.');
        return;
    }
    if ($category === null) {
        $fields['SLUG'] = site_form_text('slug');
        if (
            !preg_match('/^[a-z0-9][a-z0-9-]{0,29}$/', $fields['SLUG'])
            || in_array($fields['SLUG'], SITE_FORUM_RESERVED_SLUGS, true)
            || site_find_forum_category($db, $fields['SLUG']) !== null
        ) {
            site_admin_forum_page('The address of a new category is free, with 1 to 30 lowercase letters, digits or "-".');
            return;
        }
    }
    site_save_forum_category($db, $categoryId, $fields);
    site_audit($db, $admin, $category === null ? 'create' : 'edit', 'forum category ' . $fields['NAME']);
    site_redirect('/admin/forum/');
}
