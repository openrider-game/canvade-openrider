<?php
/**
 * Comments of a track, under its leaderboard: the form of a new comment for an account, then a
 * page of the comments, the newest first, each with its replies, the oldest first, and the form
 * of a reply folded under it. Each comment has its thumbs up (see `partials/thumbs`), and for the
 * admins a button deleting it, with its replies. Comments are not edited; those of a deleted
 * account have no text left.
 *
 * @var array   $track    Track, see site_find_track().
 * @var array[] $comments Page of the comments, see site_find_track_comments().
 * @var int     $page     Page shown, from 1.
 * @var int     $pages    Number of pages.
 * @var int     $count    Number of comments on the track, replies included.
 * @var array   $thumbed  Comments the account thumbs up, by id, see site_find_thumbed().
 */

$user = site_user();
$trackId = (int) $track['ID'];
$action = "/tracks/$trackId/comments/";

$admin = site_is_admin($user);

/** A comment or a reply: its account, its date, its text, its thumbs up and its deletion. */
$renderComment = function (array $comment) use ($user, $thumbed, $admin): void {
    $id = (int) $comment['ID'];
    ?>
    <article class="comment" id="comment-<?= $id ?>">
        <header class="comment__head">
            <?php if ($comment['AUTHOR'] === null): ?>
                <span class="muted">Deleted account</span>
            <?php else: ?>
                <a href="/users/<?= rawurlencode($comment['AUTHOR']) ?>/"><?= h($comment['AUTHOR']) ?></a>
            <?php endif; ?>
            <time class="muted" datetime="<?= h(gmdate('c', (int) $comment['CREATED'])) ?>">
                <?= h(gmdate('Y-m-d H:i', (int) $comment['CREATED'])) ?> UTC
            </time>
        </header>
        <?php if ($comment['TEXT'] === ''): ?>
            <p class="comment__text muted">Comment of a deleted account.</p>
        <?php else: ?>
            <p class="comment__text"><?= nl2br(h($comment['TEXT'])) ?></p>
        <?php endif; ?>
        <?php site_render('partials/thumbs', [
            'kind' => 'comments',
            'id' => $id,
            'count' => (int) $comment['THUMBS'],
            'thumbed' => isset($thumbed[$id]),
            'can' => site_can_thumb($user, $comment),
        ]); ?>
        <?php if ($admin): ?>
            <?php site_render('partials/delete-form', [
                'action' => "/comments/$id/delete/",
                'label' => 'Delete',
                'confirm' => $comment['PARENTID'] === null
                    ? 'Delete this comment and its replies?'
                    : 'Delete this reply?',
            ]); ?>
        <?php endif; ?>
    </article>
    <?php
};
?>
<section class="comments" id="comments">
    <h2>Comments<?= $count ? " ($count)" : '' ?></h2>

    <?php if ($user === null): ?>
        <p class="muted">
            <a href="/login/?next=<?= rawurlencode("/tracks/$trackId/#comments") ?>">Log in</a>
            to comment.
        </p>
    <?php else: ?>
        <form class="comment-form" method="post" action="<?= h($action) ?>">
            <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
            <label class="visually-hidden" for="comment-text">Your comment</label>
            <textarea class="field__input" id="comment-text" name="text" rows="3" required
                maxlength="<?= SITE_COMMENT_MAX_LENGTH ?>"
                placeholder="Your comment on the track"></textarea>
            <button class="button" type="submit">Comment</button>
        </form>
    <?php endif; ?>

    <?php if (!$comments): ?>
        <p class="muted">No comment yet.</p>
    <?php endif; ?>

    <?php foreach ($comments as $comment): ?>
        <div class="comment-thread">
            <?php $renderComment($comment); ?>
            <?php if ($comment['REPLIES'] || $user !== null): ?>
                <div class="comment-replies">
                    <?php foreach ($comment['REPLIES'] as $reply): ?>
                        <?php $renderComment($reply); ?>
                    <?php endforeach; ?>
                    <?php if ($user !== null): ?>
                        <details class="comment-reply">
                            <summary>Reply</summary>
                            <form class="comment-form" method="post" action="<?= h($action) ?>">
                                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                                <input type="hidden" name="parent" value="<?= (int) $comment['ID'] ?>" />
                                <textarea class="field__input" name="text" rows="2" required
                                    maxlength="<?= SITE_COMMENT_MAX_LENGTH ?>"
                                    aria-label="Your reply"></textarea>
                                <button class="button" type="submit">Reply</button>
                            </form>
                        </details>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </div>
    <?php endforeach; ?>

    <?php if ($pages > 1): ?>
        <nav class="comments__pages" aria-label="Pages of the comments">
            <?php if ($page > 1): ?>
                <a href="?comments=<?= $page - 1 ?>#comments">Newer comments</a>
            <?php endif; ?>
            <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
            <?php if ($page < $pages): ?>
                <a href="?comments=<?= $page + 1 ?>#comments">Older comments</a>
            <?php endif; ?>
        </nav>
    <?php endif; ?>
</section>
