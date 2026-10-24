<?php
/**
 * Card of a track, linking to its page.
 *
 * @var array $track Track, see site_find_tracks().
 */
?>
<a class="track-card" href="/tracks/<?= (int) $track['ID'] ?>/">
    <?php if ($track['THUMBNAIL']): ?>
        <img class="track-card__thumbnail" src="data:image/png;base64,<?= h($track['THUMBNAIL']) ?>"
            alt="" width="500" height="300" />
    <?php else: ?>
        <span class="track-card__thumbnail track-card__thumbnail--empty">No thumbnail</span>
    <?php endif; ?>
    <span class="track-card__info">
        <span class="track-card__title"><?= h(site_track_title($track)) ?></span>
        <span class="track-card__meta">
            <?= h(site_track_bike($track['CODE'])) ?>
            <?php if ($track['AUTHOR'] !== null): ?>
                &middot; by <?= h($track['AUTHOR']) ?>
            <?php endif; ?>
            &middot; <?= site_ghost_count((int) $track['GHOSTS']) ?>
            <?php if ($track['VERIFIERID'] === null): ?>
                &middot; unverified
            <?php endif; ?>
            <?php if ($track['BEST'] !== null): ?>
                &middot; best <?= site_duration((int) $track['BEST']) ?>
            <?php endif; ?>
        </span>
    </span>
</a>
