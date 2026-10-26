<?php
/**
 * Reviews page, for the admins: the ghosts, the runs verifying a track and the endurance runs
 * whose inputs look suspicious (see site_analyse_ghost()), to approve or reject after watching
 * them.
 *
 * @var array[] $ghosts        Ghosts waiting for an admin, see site_find_ghost_reviews().
 * @var array[] $verifications Tracks whose verifying run waits for an admin, see
 *                             site_find_verification_reviews().
 * @var array[] $runs          Endurance runs waiting for an admin, see
 *                             site_find_endurance_reviews().
 */

/**
 * Buttons approving or rejecting a ghost or a verifying run.
 *
 * @param string $kind `ghosts`, `tracks` or `runs`.
 */
$actions = function (string $kind, int $id): void {
    foreach (['approve' => 'Approve', 'reject' => 'Reject'] as $action => $label): ?>
        <form class="delete-form" method="post"
            action="/reviews/<?= $kind ?>/<?= $id ?>/<?= $action ?>/">
            <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
            <button class="button<?= $action === 'reject' ? ' button--danger' : '' ?>"
                type="submit"><?= $label ?></button>
        </form>
    <?php endforeach;
};
?>
<h1>Reviews</h1>
<p class="muted">
    These runs replay correctly, but their inputs look unusual. Watch them before approving: a
    rejected ghost or endurance run is deleted, and a rejected verification lets the verifier save
    another run.
</p>

<h2>Verifications</h2>
<?php if (!$verifications): ?>
    <p class="muted">No verification to check.</p>
<?php else: ?>
    <table class="leaderboard__table">
        <thead>
            <tr>
                <th scope="col">Track</th>
                <th scope="col">Verifier</th>
                <th scope="col" class="leaderboard__time">Time</th>
                <th scope="col">Why</th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($verifications as $verification): ?>
                <tr>
                    <td>
                        <a href="/verify/<?= (int) $verification['ID'] ?>/">
                            <?= h($verification['TITLE']) ?>
                        </a>
                    </td>
                    <td><?= h($verification['VERIFIER'] ?? '') ?></td>
                    <td class="leaderboard__time">
                        <?= site_duration((int) $verification['VERIFICATIONTIME']) ?>
                    </td>
                    <td><?= h($verification['REVIEW']) ?></td>
                    <td><?php $actions('tracks', (int) $verification['ID']); ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>

<h2>Ghosts</h2>
<?php if (!$ghosts): ?>
    <p class="muted">No ghost to check.</p>
<?php else: ?>
    <table class="leaderboard__table">
        <thead>
            <tr>
                <th scope="col">Track</th>
                <th scope="col">Rider</th>
                <th scope="col" class="leaderboard__time">Time</th>
                <th scope="col">Why</th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($ghosts as $ghost): ?>
                <tr>
                    <td>
                        <a href="/tracks/<?= (int) $ghost['TRACKID'] ?>/">
                            <?= h(site_track_title(['ID' => $ghost['TRACKID']] + $ghost)) ?>
                        </a>
                    </td>
                    <td><?= h($ghost['RIDER'] ?? '') ?></td>
                    <td class="leaderboard__time"><?= site_duration((int) $ghost['TIME']) ?></td>
                    <td><?= h($ghost['REVIEW']) ?></td>
                    <td><?php $actions('ghosts', (int) $ghost['ID']); ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>

<h2>Endurance runs</h2>
<?php if (!$runs): ?>
    <p class="muted">No endurance run to check.</p>
<?php else: ?>
    <p class="muted">
        The page of each track lists its runs waiting for an admin, to race them as ghosts.
    </p>
    <table class="leaderboard__table">
        <thead>
            <tr>
                <th scope="col">Track</th>
                <th scope="col">Rider</th>
                <th scope="col" class="leaderboard__time">Distance</th>
                <th scope="col" class="leaderboard__time">Time</th>
                <th scope="col">Why</th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($runs as $run): ?>
                <tr>
                    <td>
                        <?php
                        $runTrack = site_endurance_url((int) $run['SEED'], (int) $run['VERSION']);
                        ?>
                        <a href="<?= h($runTrack) ?>">
                            Track <?= (int) $run['SEED'] ?>
                        </a>
                    </td>
                    <td><?= h($run['RIDER']) ?></td>
                    <td class="leaderboard__time"><?= (int) $run['DISTANCE'] ?> m</td>
                    <td class="leaderboard__time"><?= site_duration((int) $run['TIME']) ?></td>
                    <td><?= h($run['REVIEW']) ?></td>
                    <td><?php $actions('runs', (int) $run['ID']); ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
