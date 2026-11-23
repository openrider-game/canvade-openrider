<?php
/**
 * Picture of an account next to its posts: its Gravatar when it shows it, else its initial.
 *
 * @var array $account Row with `AUTHOR` (null once deleted), `EMAIL` and `GRAVATAR`.
 */

$url = site_avatar_url($account);
$initial = mb_strtoupper(mb_substr($account['AUTHOR'] ?? '?', 0, 1, 'UTF-8'), 'UTF-8');
?>
<?php if ($url !== null): ?>
    <img class="forum-avatar" src="<?= h($url) ?>" alt="" width="48" height="48" loading="lazy"
        referrerpolicy="no-referrer" />
<?php else: ?>
    <span class="forum-avatar forum-avatar--initial" aria-hidden="true"><?= h($initial) ?></span>
<?php endif; ?>
