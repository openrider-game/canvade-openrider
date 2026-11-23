<?php
/**
 * Page of a topic of the forum: a page of its posts, the oldest first, each with its account,
 * its thumbs up, its quote, edit and report buttons, and for the moderators its deletion and
 * previous versions; the tools of the moderators on the topic; the form of a reply.
 *
 * @var array   $topic      The topic, see site_find_forum_topic().
 * @var array[] $posts      Page of its posts, see site_find_forum_posts().
 * @var int     $page       Page shown, from 1.
 * @var int     $pages      Number of pages.
 * @var array   $embeds     Tracks and ghosts the posts link to, see site_find_forum_embeds().
 * @var array   $edits      Previous versions of the posts, by post id, for the moderators.
 * @var array   $thumbed    Posts the account thumbs up, by id.
 * @var bool    $moderator  Whether the account moderates.
 * @var array[] $categories The categories, to move the topic to, for the moderators.
 * @var bool    $canReply   Whether the account replies.
 * @var string  $draft      Text of the reply form.
 * @var ?string $error      Why the reply sent was refused.
 * @var bool    $reported   Whether a post was just reported.
 * @var ?int    $unreadFrom First post of the page new to the account, marked, null for none.
 * @var bool    $watching   Whether the account follows the topic, told of its replies.
 */

$user = site_user();
$topicId = (int) $topic['ID'];
$base = "/forum/topics/$topicId/";
$csrf = h(site_csrf_token());
?>
<p class="forum-breadcrumb">
    <a href="/forum/">Forum</a> &rsaquo;
    <a href="/forum/<?= rawurlencode($topic['SLUG']) ?>/"><?= h($topic['CATEGORY']) ?></a>
</p>
<h1>
    <?= h($topic['TITLE']) ?>
    <?php if ($topic['PINNED']): ?><span class="forum-badge">Pinned</span><?php endif; ?>
    <?php if ($topic['LOCKED']): ?><span class="forum-badge">Locked</span><?php endif; ?>
</h1>

<?php if ($reported): ?>
    <p class="settings__saved" role="status">Thanks, the moderators will look at it.</p>
<?php endif; ?>

<?php if ($user !== null): ?>
    <form class="forum-watch" method="post" action="<?= $base . ($watching ? 'unwatch' : 'watch') ?>/">
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <input type="hidden" name="page" value="<?= $page ?>" />
        <button class="button" type="submit" aria-pressed="<?= $watching ? 'true' : 'false' ?>">
            <?= $watching ? 'Following' : 'Follow' ?>
        </button>
        <span class="muted">
            <?= $watching ? 'You are told of the new replies.' : 'Follow the topic to be told of its replies.' ?>
        </span>
    </form>
<?php endif; ?>

<?php if ($moderator): ?>
    <div class="forum-tools">
        <form method="post" action="<?= $base . ($topic['PINNED'] ? 'unpin' : 'pin') ?>/">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <button class="button" type="submit"><?= $topic['PINNED'] ? 'Unpin' : 'Pin' ?></button>
        </form>
        <form method="post" action="<?= $base . ($topic['LOCKED'] ? 'unlock' : 'lock') ?>/">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <button class="button" type="submit"><?= $topic['LOCKED'] ? 'Unlock' : 'Lock' ?></button>
        </form>
        <form class="forum-tools__move" method="post" action="<?= $base ?>move/">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <label class="visually-hidden" for="forum-move">Category</label>
            <select class="field__input" id="forum-move" name="category">
                <?php foreach ($categories as $category): ?>
                    <option value="<?= (int) $category['ID'] ?>"
                        <?= (int) $category['ID'] === (int) $topic['CATEGORYID'] ? 'selected' : '' ?>>
                        <?= h($category['NAME']) ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <button class="button" type="submit">Move</button>
        </form>
    </div>
<?php endif; ?>

<?php foreach ($posts as $post): ?>
    <?php
    $id = (int) $post['ID'];
    $deleted = $post['TEXT'] === '';
    $own = $user !== null && $post['USERID'] !== null && (int) $post['USERID'] === $user['ID'];
    $first = $id === (int) $topic['FIRSTPOSTID'];
    // Whether its topic is locked, for site_forum_can_edit()
    $post['LOCKED'] = $topic['LOCKED'];
    ?>
    <?php if ($id === $unreadFrom): ?>
        <p class="forum-new" id="unread"><span>New</span></p>
    <?php endif; ?>
    <article class="forum-post<?= $unreadFrom !== null && $id >= $unreadFrom ? ' forum-post--unread' : '' ?>" id="post-<?= $id ?>">
        <aside class="forum-post__author">
            <?php site_render('partials/forum-avatar', ['account' => $post]); ?>
            <?php if ($post['AUTHOR'] === null): ?>
                <span class="muted">Deleted account</span>
            <?php else: ?>
                <a href="/users/<?= rawurlencode($post['AUTHOR']) ?>/"><?= h($post['AUTHOR']) ?></a>
            <?php endif; ?>
        </aside>
        <div class="forum-post__main">
            <header class="forum-post__head muted">
                <a href="/forum/posts/<?= $id ?>/"><?php site_render('partials/forum-time', ['time' => (int) $post['CREATED']]); ?></a>
                <?php if ($post['EDITED'] !== null): ?>
                    &middot; edited <?php site_render('partials/forum-time', ['time' => (int) $post['EDITED']]); ?>
                <?php endif; ?>
            </header>
            <div class="forum-post__body">
                <?php if ($deleted): ?>
                    <p class="muted">Post of a deleted account.</p>
                <?php else: ?>
                    <?= site_forum_format($post['TEXT'], $embeds) ?>
                <?php endif; ?>
            </div>
            <footer class="forum-post__actions">
                <?php site_render('partials/thumbs', [
                    'kind' => 'forum/posts',
                    'id' => $id,
                    'count' => (int) $post['THUMBS'],
                    'thumbed' => isset($thumbed[$id]),
                    'can' => site_can_thumb($user, $post) && !$deleted,
                ]); ?>
                <?php if ($canReply && !$deleted): ?>
                    <a class="button" href="<?= $base ?>?page=<?= $page ?>&amp;quote=<?= $id ?>#reply">Quote</a>
                <?php endif; ?>
                <?php if (site_forum_can_edit($user, $post)): ?>
                    <a class="button" href="/forum/posts/<?= $id ?>/edit/">Edit</a>
                <?php endif; ?>
                <?php if ($moderator): ?>
                    <?php site_render('partials/delete-form', [
                        'action' => "/forum/posts/$id/delete/",
                        'label' => $first ? 'Delete the topic' : 'Delete',
                        'confirm' => $first ? 'Delete this topic with all its posts?' : 'Delete this post?',
                    ]); ?>
                <?php endif; ?>
                <?php if ($user !== null && !$own && !$deleted && !site_is_suspended($user)): ?>
                    <details class="forum-report">
                        <summary class="button">Report</summary>
                        <form method="post" action="/forum/posts/<?= $id ?>/report/">
                            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
                            <label class="visually-hidden" for="report-<?= $id ?>">Reason</label>
                            <input class="field__input" id="report-<?= $id ?>" name="reason" required
                                maxlength="<?= SITE_REPORT_REASON_MAX ?>" placeholder="What is wrong?" />
                            <button class="button" type="submit">Send</button>
                        </form>
                    </details>
                <?php endif; ?>
            </footer>
            <?php if (isset($edits[$id])): ?>
                <details class="forum-edits">
                    <summary class="muted">
                        <?= count($edits[$id]) ?> previous <?= count($edits[$id]) === 1 ? 'version' : 'versions' ?>
                    </summary>
                    <?php foreach ($edits[$id] as $edit): ?>
                        <p class="muted">
                            Replaced <?php site_render('partials/forum-time', ['time' => (int) $edit['CREATED']]); ?>
                            by <?= h($edit['EDITOR'] ?? 'a deleted account') ?>:
                        </p>
                        <pre class="forum-edits__text"><?= h($edit['TEXT']) ?></pre>
                    <?php endforeach; ?>
                </details>
            <?php endif; ?>
        </div>
    </article>
<?php endforeach; ?>

<?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages of the topic">
        <?php if ($page > 1): ?>
            <a class="button" href="<?= $base ?>?page=<?= $page - 1 ?>">Previous</a>
        <?php endif; ?>
        <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
        <?php if ($page < $pages): ?>
            <a class="button" href="<?= $base ?>?page=<?= $page + 1 ?>">Next</a>
        <?php endif; ?>
    </nav>
<?php endif; ?>

<section class="forum-reply" id="reply">
    <?php if ($canReply): ?>
        <h2>Reply</h2>
        <form method="post" action="<?= $base ?>reply/">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <?php site_render('partials/forum-editor', ['text' => $draft, 'error' => $error, 'label' => 'Your reply']); ?>
            <button class="button" type="submit">Post the reply</button>
        </form>
    <?php elseif ($topic['LOCKED']): ?>
        <p class="muted">This topic is locked: it no longer takes replies.</p>
    <?php elseif ($user !== null): ?>
        <p class="muted">Your account is suspended: it does not reply.</p>
    <?php else: ?>
        <p class="muted"><a href="/login/?next=<?= rawurlencode($base) ?>">Log in</a> to reply.</p>
    <?php endif; ?>
</section>
