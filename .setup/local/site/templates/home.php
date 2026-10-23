<?php
/**
 * Front page: the published tracks.
 *
 * @var array[] $tracks Tracks, newest first, see site_find_tracks().
 */
?>
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
