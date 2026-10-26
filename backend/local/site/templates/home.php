<?php
/**
 * Front page: the endurance mode, then the published tracks, in two tabs: the newest ones, and
 * the most liked ones (`?sort=liked`). The tabs are links, each order having its URL.
 *
 * @var array[] $tracks    Tracks in the order of the tab, see site_find_tracks().
 * @var bool    $mostLiked Whether the tab of the most liked tracks is open.
 */

$tabs = ['/' => ['Newest tracks', !$mostLiked], '/?sort=liked' => ['Most liked', $mostLiked]];
?>
<section class="mode-banner">
    <p class="mode-banner__text">
        <strong>Endurance:</strong> ride an endless generated track that gets harder the further
        you go, and see how far you get.
    </p>
    <a class="button" href="<?= h(site_daily_endurance_url()) ?>">Track of the day</a>
    <a class="button" href="/endurance/">New track</a>
</section>

<h1>Tracks</h1>

<nav class="tabs" aria-label="Order of the tracks">
    <?php foreach ($tabs as $url => [$label, $current]): ?>
        <a class="tabs__tab" href="<?= h($url) ?>" <?= $current ? 'aria-current="page"' : '' ?>>
            <?= h($label) ?>
        </a>
    <?php endforeach; ?>
</nav>

<?php if (!$tracks): ?>
    <p class="muted">No track yet: <a href="/create/">create the first one</a>.</p>
<?php else: ?>
    <ul class="track-grid">
        <?php foreach ($tracks as $track): ?>
            <li><?php site_render('partials/track-card', ['track' => $track]); ?></li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>
