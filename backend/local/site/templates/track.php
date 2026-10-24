<?php
/**
 * Track page: the game racing the track, and the leaderboard of its ghosts.
 *
 * The riders are the accounts of the ghosts, or the names of their ghost strings for the ghosts
 * saved without the site. Clicking a rider toggles their ghost in the game, see
 * `public/js/leaderboard.js`. The run verifying the track is marked, and the ghosts waiting for
 * an admin, listed for their own account and the admins only, have no rank.
 *
 * @var array   $track  Track, see site_find_track().
 * @var array[] $ghosts Ghosts of the track, fastest first, see site_find_ghosts().
 */

$user = site_user();
?>
<h1>
    <?= h(site_track_title($track)) ?>
    <span class="muted">&middot; <?= h(site_track_bike($track['CODE'])) ?></span>
    <?php if ($track['AUTHOR'] !== null): ?>
        <span class="muted">
            by
            <a href="/users/<?= rawurlencode($track['AUTHOR']) ?>/"><?= h($track['AUTHOR']) ?></a>
        </span>
    <?php endif; ?>
</h1>

<?php if ($track['DESCRIPTION'] !== null): ?>
    <p class="track-description"><?= nl2br(h($track['DESCRIPTION'])) ?></p>
<?php endif; ?>

<p class="track-verification muted">
    <?php if ($track['VERIFIERID'] === null): ?>
        Unverified: published before the verification of the tracks.
    <?php elseif ($track['VERIFIER'] === null): ?>
        Verified by an account deleted since.
    <?php else: ?>
        Verified by
        <a href="/users/<?= rawurlencode($track['VERIFIER']) ?>/"><?= h($track['VERIFIER']) ?></a>.
    <?php endif; ?>
</p>

<?php if (site_can_delete($user, $track['USERID'])): ?>
    <?php site_render('partials/delete-form', [
        'action' => '/tracks/' . (int) $track['ID'] . '/delete/',
        'label' => 'Delete the track',
        'confirm' => 'Delete this track and all its ghosts?',
    ]); ?>
<?php endif; ?>

<?php site_render('partials/game', ['attributes' => [
    'base-url' => '/tracks/' . (int) $track['ID'] . '/',
    'track-id' => (int) $track['ID'],
]]); ?>

<section class="leaderboard" aria-labelledby="leaderboard-title">
    <h2 id="leaderboard-title">Leaderboard</h2>

    <?php if ($user === null): ?>
        <?php $next = rawurlencode('/tracks/' . (int) $track['ID'] . '/'); ?>
        <p class="muted">
            <a href="/login/?next=<?= $next ?>">Log in</a> to save your time on the leaderboard.
        </p>
    <?php endif; ?>

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
                    <?php if ($user !== null): ?>
                        <th scope="col"><span class="visually-hidden">Actions</span></th>
                    <?php endif; ?>
                </tr>
            </thead>
            <tbody>
                <?php $rank = 0; ?>
                <?php foreach ($ghosts as $ghost): ?>
                    <?php
                    $verifying = (int) $track['VERIFICATIONGHOSTID'] === (int) $ghost['ID'];
                    $reviewed = $ghost['REVIEW'] === null;
                    ?>
                    <tr>
                        <td><?= $reviewed ? ++$rank : '&ndash;' ?></td>
                        <td>
                            <button class="button leaderboard__rider" type="button"
                                data-ghost-id="<?= (int) $ghost['ID'] ?>" aria-pressed="false">
                                <?= h($ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING'])) ?>
                            </button>
                            <?php if ($verifying): ?>
                                <span class="badge">verifier</span>
                            <?php endif; ?>
                            <?php if (!$reviewed): ?>
                                <span class="badge badge--review"
                                    title="<?= h($ghost['REVIEW']) ?>">
                                    checked by an admin
                                </span>
                            <?php endif; ?>
                        </td>
                        <td><?= h(site_ghost_bike($ghost['GHOSTSTRING'])) ?></td>
                        <td class="leaderboard__time">
                            <?= site_duration((int) $ghost['TIME']) ?>
                        </td>
                        <?php if ($user !== null): ?>
                            <td>
                                <?php // The verifying run is the proof of the track: admins only ?>
                                <?php if (
                                    site_can_delete($user, $ghost['USERID'])
                                    && (!$verifying || site_is_admin($user))
                                ): ?>
                                    <?php site_render('partials/delete-form', [
                                        'action' => '/ghosts/' . (int) $ghost['ID'] . '/delete/',
                                        'label' => 'Delete',
                                        'confirm' => 'Delete this ghost?',
                                    ]); ?>
                                <?php endif; ?>
                            </td>
                        <?php endif; ?>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <p class="leaderboard__status muted" role="status"></p>
    <?php endif; ?>
</section>
