<?php
/**
 * Endurance page: the game riding an infinite generated track, getting harder the further it
 * goes. The game shows the number of its track: the page rides a given number again, or the track
 * of the day, the same for everyone.
 *
 * The track of the day has a leaderboard under the game: the best run of each account, saved by
 * the game once over, racing as a ghost when its rider is clicked (see `public/js/leaderboard.js`)
 * and shown again once the game saves a run (see `public/js/endurance-leaderboard.js`). The tracks
 * of the days before keep their leaderboard, closed.
 *
 * @var int|null   $seed        Number of the track to ride, null for a new track on each load.
 * @var int        $dailySeed   Number of the track of the day, see site_daily_endurance_seed().
 * @var array      $attributes  Data attributes of the game, see partials/game.php.
 * @var bool       $leaderboard Whether the track has a leaderboard: a track of the day.
 * @var bool       $open        Whether the runs on the track are saved: the track of the day.
 * @var array[]    $top         Best runs, best first, see site_find_endurance_runs().
 * @var int        $riderCount  Number of runs ranked.
 * @var array|null $mine        Run of the account, see site_find_endurance_run_of().
 * @var array[]    $reviews     Runs waiting for an admin, for the admins, see
 *                              site_find_endurance_reviews().
 */

$user = site_user();

/** Row of a run: its rank, its rider racing it when clicked, its distance and time. */
$row = function (string $rank, int $runId, string $name, int $distance, int $time, bool $mine) {
    ?>
    <tr<?= $mine ? ' class="leaderboard__mine"' : '' ?>>
        <td><?= h($rank) ?></td>
        <td>
            <button class="button leaderboard__rider" type="button" data-ghost-id="<?= $runId ?>"
                aria-pressed="false"><?= h($name) ?></button>
        </td>
        <td class="leaderboard__time"><?= $distance ?> m</td>
        <td class="leaderboard__time"><?= site_duration($time) ?></td>
    </tr>
    <?php
};
?>
<h1>
    Endurance
    <span class="muted">
        &middot;
        <?php if ($seed === null): ?>
            a new track on each ride
        <?php elseif ($seed === $dailySeed): ?>
            track of the day, <?= $seed ?>
        <?php else: ?>
            track <?= $seed ?>
        <?php endif; ?>
    </span>
</h1>

<p class="endurance-intro">
    Ride an endless track, generated as you go, that gets harder the further you get: wider gaps,
    steeper drops, and zones under a status effect. Ride as far as you can; at equal distance, the
    fastest ride wins.
</p>

<div class="endurance-options">
    <a class="button" href="/endurance/?seed=<?= $dailySeed ?>"
        <?= $seed === $dailySeed ? 'aria-current="page"' : '' ?>>Track of the day</a>
    <a class="button" href="/endurance/" <?= $seed === null ? 'aria-current="page"' : '' ?>>New
        track</a>
    <form class="endurance-options__form" method="get" action="/endurance/">
        <label class="endurance-options__label" for="endurance-seed">Track number</label>
        <input class="field__input endurance-options__input" id="endurance-seed" name="seed"
            type="text" inputmode="numeric" pattern="[0-9]{1,10}" maxlength="10"
            value="<?= $seed ?? '' ?>" required />
        <button class="button" type="submit">Ride</button>
    </form>
</div>

<?php site_render('partials/game', ['attributes' => $attributes]); ?>

<?php if ($leaderboard): ?>
    <section class="leaderboard" aria-labelledby="leaderboard-title">
        <h2 id="leaderboard-title"><?= $open ? 'Leaderboard of the day' : 'Leaderboard' ?></h2>
        <p class="muted">
            <?php if (!$open): ?>
                The day of this track is over: its leaderboard is closed.
            <?php elseif ($user === null): ?>
                <a href="/login/?next=<?= rawurlencode('/endurance/?seed=' . $seed) ?>">Log in</a>
                to save your best run of the day.
            <?php else: ?>
                Your best run of the day is saved when you fall, once the server rode it again.
            <?php endif; ?>
            Click a rider to race against their ghost, and again to remove it.
        </p>

        <?php if (!$top): ?>
            <p class="muted">No run yet: be the first one on the leaderboard.</p>
        <?php else: ?>
            <table class="leaderboard__table">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Rider</th>
                        <th scope="col" class="leaderboard__time">Distance</th>
                        <th scope="col" class="leaderboard__time">Time</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($top as $index => $run): ?>
                        <?php $row(
                            (string) ($index + 1),
                            (int) $run['ID'],
                            $run['NAME'],
                            (int) $run['DISTANCE'],
                            (int) $run['TIME'],
                            (int) $run['USERID'] === ($user['ID'] ?? null)
                        ); ?>
                    <?php endforeach; ?>
                    <?php // The run of the account, under the top when it ranks further ?>
                    <?php if ($mine !== null && $mine['RANK'] !== null && $mine['RANK'] > count($top)): ?>
                        <tr class="leaderboard__gap">
                            <td colspan="4">&hellip;</td>
                        </tr>
                        <?php $row(
                            (string) $mine['RANK'],
                            (int) $mine['ID'],
                            $mine['NAME'],
                            (int) $mine['DISTANCE'],
                            (int) $mine['TIME'],
                            true
                        ); ?>
                    <?php endif; ?>
                </tbody>
            </table>
            <p class="muted">
                The <?= count($top) ?> best of <?= $riderCount ?>
                <?= $riderCount === 1 ? 'rider' : 'riders' ?>, by their best run.
            </p>
        <?php endif; ?>

        <?php if ($mine !== null && $mine['RANK'] === null): ?>
            <p class="muted">
                Your run of <?= (int) $mine['DISTANCE'] ?> m is checked by an admin before it
                ranks.
            </p>
        <?php endif; ?>

        <?php if ($reviews): ?>
            <h3 class="tabs__heading">Waiting for an admin</h3>
            <table class="leaderboard__table">
                <tbody>
                    <?php foreach ($reviews as $run): ?>
                        <?php $row(
                            '',
                            (int) $run['ID'],
                            $run['RIDER'],
                            (int) $run['DISTANCE'],
                            (int) $run['TIME'],
                            false
                        ); ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <p class="muted"><a href="/reviews/">Approve or reject them</a> after watching them.</p>
        <?php endif; ?>

        <p class="leaderboard__status" role="status"></p>
    </section>
<?php endif; ?>

<div class="game-help muted">
    <p>
        The game shows the number of the track at its top right: ride it again, or share
        <?php if ($seed !== null): ?>
            <a href="/endurance/?seed=<?= $seed ?>">the link of this track</a>.
        <?php else: ?>
            its link, <code>/endurance/?seed=&lt;number&gt;</code>.
        <?php endif; ?>
        After a crash or a fall, <kbd>Enter</kbd> rides the same track again and <kbd>N</kbd> a
        new one. Your best rides, overall and on each track, are also kept in this browser.
    </p>
    <p>
        Besides boosts and slow motions, the track has launchers kicking the bike over wide gaps,
        and mud slowing it down. Its zones start with a status effect, lasting until the reset items
        ending the zone: low gravity, turbo, slippery wheels, heavy bike, no steering, mirrored
        leaning, invincibility over harsher bumps and bombs, engine off, or zero gravity.
    </p>
</div>
