<?php
/**
 * Track page: the game racing the track, and the leaderboard of its ghosts.
 *
 * Clicking a rider toggles their ghost in the game, see `public/js/leaderboard.js`.
 *
 * @var array   $track  Track, see site_find_track().
 * @var array[] $ghosts Ghosts of the track, fastest first.
 */
?>
<h1>
    <?= h(site_track_title($track)) ?>
    <span class="muted">&middot; <?= h(site_track_bike($track['CODE'])) ?></span>
</h1>

<?php site_render('partials/game', ['trackId' => (int) $track['ID']]); ?>

<section class="leaderboard" aria-labelledby="leaderboard-title">
    <h2 id="leaderboard-title">Leaderboard</h2>

    <?php if (!$ghosts): ?>
        <p class="muted">No ghost yet: finish the track and save your time to be the first one.</p>
    <?php else: ?>
        <p class="muted">Click a rider to race against their ghost, and again to remove it.</p>
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">#</th>
                    <th scope="col">Rider</th>
                    <th scope="col">Bike</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($ghosts as $rank => $ghost): ?>
                    <tr>
                        <td><?= $rank + 1 ?></td>
                        <td>
                            <button class="button leaderboard__rider" type="button"
                                data-ghost-id="<?= (int) $ghost['ID'] ?>" aria-pressed="false">
                                <?= h(site_ghost_name($ghost['GHOSTSTRING'])) ?>
                            </button>
                        </td>
                        <td><?= h(site_ghost_bike($ghost['GHOSTSTRING'])) ?></td>
                        <td class="leaderboard__time"><?= site_seconds((int) $ghost['TIME']) ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <p class="leaderboard__status muted" role="status"></p>
    <?php endif; ?>
</section>
