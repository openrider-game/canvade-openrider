<?php
/**
 * Forum page: its categories in their order, each with its number of topics and posts and its
 * topic with the latest post.
 *
 * @var array[] $categories See site_find_forum_categories().
 */
?>
<h1>Forum</h1>

<ul class="forum-list">
    <?php foreach ($categories as $category): ?>
        <li class="forum-list__item">
            <div>
                <a class="forum-list__title" href="/forum/<?= h($category['SLUG']) ?>/"><?= h($category['NAME']) ?></a>
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
