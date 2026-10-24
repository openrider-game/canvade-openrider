<?php
/**
 * Row of a ghost in the leaderboards of the track page: its rank, its rider racing it when
 * clicked (see `public/js/leaderboard.js`), its bike, its time, and its delete button.
 *
 * @var array       $track  Track, see site_find_track().
 * @var array       $ghost  Ghost, see site_find_ghosts().
 * @var string      $name   Name of the rider.
 * @var string      $rank   Rank shown, empty for the other ghosts of a rider.
 * @var array|null  $user   Logged in account, adding the column of the delete buttons.
 * @var string|null $group  Rider whose other ghosts this row lists, folded with them; null for
 *                          the best ghost of a rider.
 * @var array       $more   For the best ghost of a rider, the id of their group and their number
 *                          of other ghosts, unfolding them (`group` and `count`); empty without.
 */

$verifying = (int) $track['VERIFICATIONGHOSTID'] === (int) $ghost['ID'];
?>
<?php if ($group === null): ?>
    <tr>
<?php else: ?>
    <tr class="leaderboard__other" data-group="<?= h($group) ?>">
<?php endif; ?>
    <td><?= h($rank) ?></td>
    <td>
        <button class="button leaderboard__rider" type="button"
            data-ghost-id="<?= (int) $ghost['ID'] ?>" aria-pressed="false"><?= h($name) ?></button>
        <?php if ($verifying): ?>
            <span class="badge">verifier</span>
        <?php endif; ?>
        <?php if ($ghost['REVIEW'] !== null): ?>
            <span class="badge badge--review" title="<?= h($ghost['REVIEW']) ?>">
                checked by an admin
            </span>
        <?php endif; ?>
        <?php if ($more): ?>
            <button class="button leaderboard__more" type="button" aria-expanded="true"
                data-group="<?= h($more['group']) ?>" hidden>
                <?= (int) $more['count'] ?> more
            </button>
        <?php endif; ?>
    </td>
    <td><?= h(site_ghost_bike($ghost['GHOSTSTRING'])) ?></td>
    <td class="leaderboard__time"><?= site_duration((int) $ghost['TIME']) ?></td>
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
