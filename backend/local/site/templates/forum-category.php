<?php
/**
 * Page of a category of the forum: a page of its topics, the pinned ones first, then by their
 * last post, and the button opening a topic.
 *
 * @var array   $category The category, see site_find_forum_category().
 * @var array[] $topics   Page of its topics, see site_find_forum_topics().
 * @var int     $page     Page shown, from 1.
 * @var int     $pages    Number of pages.
 * @var bool    $canOpen  Whether the account opens topics here, see site_forum_can_open_topic().
 *
 * The topics with posts the account did not read are marked, opening on the first of them.
 */

$base = '/forum/' . rawurlencode($category['SLUG']) . '/';
?>
<p class="forum-breadcrumb"><a href="/forum/">Forum</a></p>
<h1><?= h($category['NAME']) ?></h1>
<p class="muted"><?= h($category['DESCRIPTION']) ?></p>

<div class="forum-bar">
    <?php site_render('partials/forum-search-form', ['query' => '', 'category' => $category]); ?>
    <?php if ($canOpen): ?>
        <a class="button" href="<?= $base ?>new/">New topic</a>
    <?php elseif (site_user() === null): ?>
        <p class="muted"><a href="/login/?next=<?= rawurlencode($base) ?>">Log in</a> to open a topic.</p>
    <?php endif; ?>
</div>

<?php if (!$topics): ?>
    <p class="muted">No topic yet.</p>
<?php else: ?>
    <div class="table-scroll">
        <table class="leaderboard__table forum-topics">
            <thead>
                <tr>
                    <th scope="col">Topic</th>
                    <th scope="col" class="users__count">Replies</th>
                    <th scope="col">Last post</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($topics as $topic): ?>
                    <?php $unread = (bool) $topic['UNREAD']; ?>
                    <tr<?= $unread ? ' class="forum-topics__unread"' : '' ?>>
                        <td>
                            <?php if ($topic['PINNED']): ?><span class="forum-badge">Pinned</span><?php endif; ?>
                            <?php if ($topic['LOCKED']): ?><span class="forum-badge">Locked</span><?php endif; ?>
                            <?php if ($unread): ?>
                                <a class="forum-badge forum-badge--new" href="/forum/topics/<?= (int) $topic['ID'] ?>/unread/"
                                    title="Go to the first unread post">New</a>
                            <?php endif; ?>
                            <a href="/forum/topics/<?= (int) $topic['ID'] ?>/<?= $unread ? 'unread/' : '' ?>"><?= h($topic['TITLE']) ?></a>
                            <span class="muted">by <?= h($topic['AUTHOR'] ?? 'a deleted account') ?></span>
                        </td>
                        <td class="users__count"><?= (int) $topic['POSTS'] - 1 ?></td>
                        <td class="muted">
                            <a href="/forum/topics/<?= (int) $topic['ID'] ?>/?page=last#post-<?= (int) $topic['LASTPOSTID'] ?>">
                                <?php site_render('partials/forum-time', ['time' => (int) $topic['LASTPOSTAT']]); ?>
                            </a>
                            by <?= h($topic['LASTAUTHOR'] ?? 'a deleted account') ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages of the topics">
        <?php if ($page > 1): ?>
            <a class="button" href="<?= $base ?>?page=<?= $page - 1 ?>">Previous</a>
        <?php endif; ?>
        <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
        <?php if ($page < $pages): ?>
            <a class="button" href="<?= $base ?>?page=<?= $page + 1 ?>">Next</a>
        <?php endif; ?>
    </nav>
<?php endif; ?>
