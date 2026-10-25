<?php
/**
 * Front page: the endurance mode, then the published tracks.
 *
 * @var array[] $tracks Tracks, newest first, see site_find_tracks().
 */
?>
<section class="mode-banner">
    <p class="mode-banner__text">
        <strong>Endurance:</strong> ride an endless generated track that gets harder the further
        you go, and see how far you get.
    </p>
    <a class="button" href="/endurance/?seed=<?= site_daily_endurance_seed() ?>">Track of the
        day</a>
    <a class="button" href="/endurance/">New track</a>
</section>

<h1>Tracks</h1>

<?php if (!$tracks): ?>
    <p class="muted">No track yet: <a href="/create/">create the first one</a>.</p>
<?php else: ?>
    <ul class="track-grid">
        <?php foreach ($tracks as $track): ?>
            <li><?php site_render('partials/track-card', ['track' => $track]); ?></li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>
