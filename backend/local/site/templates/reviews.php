<?php
/**
 * Reviews page, for the admins: the ghosts, the runs verifying a track and the endurance runs
 * whose inputs look suspicious (see site_analyse_ghost()), to approve or reject after watching
 * them, and the ghosts the riders reported. Each run shows the time its rider spent on the track
 * before saving it, measured by the server, and its inputs (see `partials/ghost-inputs.php`).
 *
 * @var array[] $ghosts        Ghosts waiting for an admin, see site_find_ghost_reviews().
 * @var array[] $verifications Tracks whose verifying run waits for an admin, see
 *                             site_find_verification_reviews().
 * @var array[] $runs          Endurance runs waiting for an admin, see
 *                             site_find_endurance_reviews().
 * @var array[] $reports       Reported ghosts, see site_find_ghost_reports().
 */

/**
 * Buttons acting on a run waiting for an admin, or on a reported ghost.
 *
 * @param string $kind    `ghosts`, `tracks`, `runs` or `reports`.
 * @param array  $actions Labels by action, approving or dismissing first.
 */
$actions = function (
    string $kind,
    int $id,
    array $actions = ['approve' => 'Approve', 'reject' => 'Reject']
): void {
    foreach ($actions as $action => $label): ?>
        <form class="delete-form" method="post"
            action="/reviews/<?= $kind ?>/<?= $id ?>/<?= $action ?>/">
            <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
            <button class="button<?= $action === 'reject' ? ' button--danger' : '' ?>"
                type="submit"><?= $label ?></button>
        </form>
    <?php endforeach;
};

/** Time spent on the track before saving a run, measured by the server, or `unknown`. */
$onTrack = function ($seconds): string {
    return $seconds === null ? '<span class="muted">unknown</span>' : h(site_elapsed((int) $seconds));
};

/** Row under a run unfolding its inputs, across the columns of its table. */
$inputsRow = function (string $ghostString, int $columns): void { ?>
    <tr class="reviews__inputs">
        <td colspan="<?= $columns ?>">
            <details>
                <summary>Inputs</summary>
                <?php site_render('partials/ghost-inputs', ['ghostString' => $ghostString]); ?>
            </details>
        </td>
    </tr>
<?php };
?>
<h1>Reviews</h1>
<p class="muted">
    These runs replay correctly, but their inputs look unusual. Watch them before approving: a
    rejected ghost or endurance run is deleted, and a rejected verification lets the verifier save
    another run. The time on the track is measured by the server, from the first opening of the
    page in the rider's session to the saving of the run: it cannot be shorter than it was, only
    longer.
</p>

<h2>Verifications</h2>
<?php if (!$verifications): ?>
    <p class="muted">No verification to check.</p>
<?php else: ?>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Verifier</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                    <th scope="col">On the track</th>
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
                        <td><?= $onTrack($verification['VERIFICATIONSECONDS']) ?></td>
                        <td><?= h($verification['REVIEW']) ?></td>
                        <td><?php $actions('tracks', (int) $verification['ID']); ?></td>
                    </tr>
                    <?php if ($verification['VERIFICATIONGHOST'] !== null): ?>
                        <?php $inputsRow($verification['VERIFICATIONGHOST'], 6); ?>
                    <?php endif; ?>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<h2>Ghosts</h2>
<?php if (!$ghosts): ?>
    <p class="muted">No ghost to check.</p>
<?php else: ?>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Rider</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                    <th scope="col">On the track</th>
                    <th scope="col">Why</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($ghosts as $ghost): ?>
                    <tr>
                        <td>
                            <?php // The track racing the ghost, shown to the admins while it waits ?>
                            <?php
                            $race = '/tracks/' . (int) $ghost['TRACKID']
                                . '/?ghosts=' . (int) $ghost['ID'];
                            ?>
                            <a href="<?= h($race) ?>">
                                <?= h(site_track_title(['ID' => $ghost['TRACKID']] + $ghost)) ?>
                            </a>
                        </td>
                        <td><?= h($ghost['RIDER'] ?? '') ?></td>
                        <td class="leaderboard__time">
                            <?php // Its page: inputs, rider, and the record when it was saved ?>
                            <a href="/ghosts/<?= (int) $ghost['ID'] ?>/">
                                <?= site_duration((int) $ghost['TIME']) ?>
                            </a>
                        </td>
                        <td><?= $onTrack($ghost['TRACKSECONDS']) ?></td>
                        <td><?= h($ghost['REVIEW']) ?></td>
                        <td><?php $actions('ghosts', (int) $ghost['ID']); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<h2>Endurance runs</h2>
<?php if (!$runs): ?>
    <p class="muted">No endurance run to check.</p>
<?php else: ?>
    <p class="muted">
        The page of each track lists its runs waiting for an admin, to race them as ghosts.
    </p>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Rider</th>
                    <th scope="col" class="leaderboard__time">Distance</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                    <th scope="col">On the track</th>
                    <th scope="col">Why</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($runs as $run): ?>
                    <tr>
                        <td>
                            <?php
                            // The track racing the run of its rider, shown to the admins while it waits
                            $runTrack = site_endurance_url(
                                (int) $run['SEED'],
                                (int) $run['VERSION'],
                                ['rider' => $run['RIDER']]
                            );
                            ?>
                            <a href="<?= h($runTrack) ?>">
                                Track <?= (int) $run['SEED'] ?>
                            </a>
                        </td>
                        <td><?= h($run['RIDER']) ?></td>
                        <td class="leaderboard__time"><?= (int) $run['DISTANCE'] ?> m</td>
                        <td class="leaderboard__time"><?= site_duration((int) $run['TIME']) ?></td>
                        <td><?= $onTrack($run['TRACKSECONDS']) ?></td>
                        <td><?= h($run['REVIEW']) ?></td>
                        <td><?php $actions('runs', (int) $run['ID']); ?></td>
                    </tr>
                    <?php $inputsRow($run['GHOSTSTRING'], 7); ?>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<h2>Reports</h2>
<?php if (!$reports): ?>
    <p class="muted">No ghost reported.</p>
<?php else: ?>
    <p class="muted">
        Ghosts the riders reported, the most reported first. They stay on the leaderboard until
        rejected; dismissing drops their reports.
    </p>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Rider</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                    <th scope="col">Reports</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($reports as $reported): ?>
                    <tr>
                        <td>
                            <a href="/tracks/<?= (int) $reported['TRACKID'] ?>/">
                                <?= h(site_track_title(['ID' => $reported['TRACKID']] + $reported)) ?>
                            </a>
                        </td>
                        <td><?= h($reported['RIDER'] ?? '') ?></td>
                        <td class="leaderboard__time">
                            <a href="/ghosts/<?= (int) $reported['ID'] ?>/">
                                <?= site_duration((int) $reported['TIME']) ?>
                            </a>
                        </td>
                        <td>
                            <details>
                                <summary>
                                    <?= count($reported['REPORTS']) ?>
                                    <?= count($reported['REPORTS']) === 1 ? 'report' : 'reports' ?>
                                </summary>
                                <ul class="reviews__reports">
                                    <?php foreach ($reported['REPORTS'] as $report): ?>
                                        <li>
                                            <?= h($report['REASON']) ?>
                                            <span class="muted">
                                                by <?= h($report['REPORTER'] ?? 'a deleted account') ?>,
                                                <?= h(gmdate('Y-m-d', (int) $report['CREATED'])) ?>
                                            </span>
                                        </li>
                                    <?php endforeach; ?>
                                </ul>
                            </details>
                        </td>
                        <td>
                            <?php $actions(
                                'reports',
                                (int) $reported['ID'],
                                ['dismiss' => 'Dismiss', 'reject' => 'Reject']
                            ); ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>
