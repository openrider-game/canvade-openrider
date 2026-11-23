<?php
/**
 * Notifications of the account, the unread ones first, each opening what it is about; the button
 * marking them all read.
 *
 * @var array[] $notifications See site_find_notifications().
 */

$unread = count(array_filter($notifications, fn (array $notification) => !$notification['SEEN']));
?>
<h1>Notifications</h1>

<?php if ($unread > 0): ?>
    <form class="forum-bar" method="post" action="/notifications/read/">
        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
        <button class="button" type="submit">Mark all as read</button>
    </form>
<?php endif; ?>

<?php if (!$notifications): ?>
    <p class="muted">
        Nothing yet. You are told here of the replies in the forum topics you follow, of the
        comments on your tracks, and of the replies to your comments.
    </p>
<?php else: ?>
    <ul class="notifications">
        <?php foreach ($notifications as $notification): ?>
            <li class="notifications__item<?= $notification['SEEN'] ? '' : ' notifications__item--unread' ?>">
                <a href="/notifications/<?= (int) $notification['ID'] ?>/">
                    <?php if (!$notification['SEEN']): ?>
                        <span class="visually-hidden">Unread:</span>
                    <?php endif; ?>
                    <?= site_notification_html($notification) ?>
                </a>
                <span class="muted">
                    <?php site_render('partials/forum-time', ['time' => (int) $notification['CREATED']]); ?>
                </span>
            </li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>
