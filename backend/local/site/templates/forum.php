<?php
/**
 * Forum page: its categories in their order, each with its number of topics and posts, its
 * topic with the latest post and the topics with posts the account did not read; the search, and
 * the button marking the whole forum read.
 *
 * @var array[] $categories See site_find_forum_categories().
 * @var ?array  $user       The account, null when logged out.
 */

$unread = array_sum(array_map(fn (array $category) => (int) $category['UNREAD'], $categories));
?>
<h1>Forum</h1>

<div class="forum-bar">
    <?php site_render('partials/forum-search-form', ['query' => '', 'category' => null]); ?>
    <?php if ($user !== null && $unread > 0): ?>
        <form method="post" action="/forum/read/">
            <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
            <button class="button" type="submit">Mark all as read</button>
        </form>
    <?php endif; ?>
</div>

<ul class="forum-list">
    <?php foreach ($categories as $category): ?>
        <li class="forum-list__item">
            <div>
                <a class="forum-list__title" href="/forum/<?= h($category['SLUG']) ?>/"><?= h($category['NAME']) ?></a>
                <?php if ((int) $category['UNREAD'] > 0): ?>
                    <span class="forum-badge forum-badge--new"><?= (int) $category['UNREAD'] ?> new</span>
                <?php endif; ?>
                <p class="muted"><?= h($category['DESCRIPTION']) ?></p>
            </div>
            <div class="forum-list__meta muted">
                <?= (int) $category['TOPICS'] ?> <?= (int) $category['TOPICS'] === 1 ? 'topic' : 'topics' ?>,
                <?= (int) $category['POSTS'] ?> <?= (int) $category['POSTS'] === 1 ? 'post' : 'posts' ?>
                <?php if ($category['LAST'] !== null): ?>
                    <br />Latest: <a href="/forum/topics/<?= (int) $category['LAST']['ID'] ?>/?page=last"><?= h($category['LAST']['TITLE']) ?></a>
                    <?php site_render('partials/forum-time', ['time' => (int) $category['LAST']['LASTPOSTAT']]); ?>
                <?php endif; ?>
            </div>
        </li>
    <?php endforeach; ?>
</ul>
