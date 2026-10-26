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
 * An account with a ranked run shares a link racing it (`rider` parameter), its ghost racing from
 * the start for whoever opens it, the page telling whose ghost it is.
 *
 * @var int|null   $seed        Number of the track to ride, null for a new track on each load.
 * @var int        $version     Version of the generator of the track, see
 *                              SITE_ENDURANCE_VERSIONS.
 * @var bool       $daily       Whether the track is the track of the day.
 * @var array      $attributes  Data attributes of the game, see partials/game.php.
 * @var bool       $leaderboard Whether the track has a leaderboard: a track of the day.
 * @var bool       $open        Whether the runs on the track are saved: the track of the day.
 * @var array[]    $top         Best runs, best first, see site_find_endurance_runs().
 * @var int        $riderCount  Number of runs ranked.
 * @var array|null $mine        Run of the account, see site_find_endurance_run_of().
 * @var array[]    $reviews     Runs waiting for an admin, for the admins, see
 *                              site_find_endurance_reviews().
 * @var string|null $rider      Name of the rider of a shared link, null without one.
 * @var array|null  $rival      Run of that rider on the track, racing from the start, see
 *                              site_find_endurance_run_by_name(); null without one.
 * @var string|null $live       Live session of the page, see site_live_session(): its riders
 *                              ride the track at the same time, its results listed under the
 *                              game (see `public/js/live-results.js`).
 * @var string|null $newLive    Page of a new live session on the track, or on a new one; null
 *                              in a session or without live races.
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
        <?php elseif ($daily): ?>
            track of the day, <?= $seed ?>
        <?php else: ?>
            track <?= $seed ?>
            <?php // The tracks of the older versions of the generator tell theirs, as the game ?>
            <?= $version === site_endurance_version_of_day() ? '' : "(v$version)" ?>
        <?php endif; ?>
    </span>
</h1>

<p class="endurance-intro">
    Ride an endless track, generated as you go, that gets harder the further you get: wider gaps,
    steeper drops, and zones under a status effect. Ride as far as you can; at equal distance, the
    fastest ride wins.
</p>

<div class="endurance-options">
    <a class="button" href="<?= h(site_daily_endurance_url()) ?>"
        <?= $daily ? 'aria-current="page"' : '' ?>>Track of the day</a>
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

<?php if ($rival !== null): ?>
    <p class="endurance-rival">
        Racing against the ghost of
        <a href="/users/<?= rawurlencode($rival['NAME']) ?>/"><?= h($rival['NAME']) ?></a>:
        <?= (int) $rival['DISTANCE'] ?> m in <?= site_duration((int) $rival['TIME']) ?>.
    </p>
<?php elseif ($rider !== null): ?>
    <p class="endurance-rival muted"><?= h($rider) ?> has no run to race on this track.</p>
<?php endif; ?>

<?php // Shown again with the leaderboard once the game saved a run, see endurance-leaderboard.js ?>
<div class="share-slot">
    <?php if ($mine !== null && $mine['RANK'] !== null): ?>
        <?php
        $shareLink = site_endurance_url($seed, $version, ['rider' => $mine['NAME']]);
        $result = (int) $mine['DISTANCE'] . ' m in ' . site_duration((int) $mine['TIME']);
        $shareText = $daily
            ? "I rode $result in the daily endurance of OpenRider! Can you do better?"
            : "I rode $result on the OpenRider endurance track $seed! Can you do better?";
        ?>
        <p class="share share-bar">
            <a class="button button--accent" href="<?= h($shareLink) ?>" data-share
                data-share-text="<?= h($shareText) ?>">Challenge your friends</a>
            <span>
                Your best: <?= $result ?>, rank <?= (int) $mine['RANK'] ?>. The link races your
                ghost.
            </span>
            <span class="share__status muted" role="status"></span>
        </p>
    <?php endif; ?>
</div>

<?php if ($live !== null): ?>
    <?php $sessionLink = site_endurance_url($seed, $version, ['live' => $live]); ?>
    <p class="share share-bar live-bar">
        <a class="button button--accent" href="<?= h($sessionLink) ?>" data-share
            data-share-text="<?= h("Ride the OpenRider endurance track $seed live with me!") ?>"
            >Invite riders</a>
        <span>Live session: everyone with the link rides with you.</span>
        <a class="button" href="<?= h(site_endurance_url($seed, $version)) ?>">Leave</a>
        <span class="share__status muted" role="status"></span>
    </p>
<?php elseif ($newLive !== null): ?>
    <p class="live-bar">
        <a class="button" href="<?= h($newLive) ?>">Race live</a>
        <span class="muted">
            Start a session <?= $seed === null ? 'on a new track' : 'on this track' ?> and send
            its link: you see each other ride.
        </span>
    </p>
<?php endif; ?>

<?php site_render('partials/game', ['attributes' => $attributes]); ?>

<?php if ($live !== null): ?>
    <section class="live-results" aria-labelledby="live-results-title">
        <h2 id="live-results-title">Live results</h2>
        <p class="live-results__status muted" role="status">Connecting to the session...</p>
        <table class="leaderboard__table" hidden>
            <thead>
                <tr>
                    <th scope="col">#</th>
                    <th scope="col">Rider</th>
                    <th scope="col" class="leaderboard__time">Best run</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
        <p class="muted">
            The furthest run of each rider of the session, verified as the leaderboard runs are.
        </p>
    </section>
<?php endif; ?>

<?php if ($leaderboard): ?>
    <?php // The ghosts only race on their track, a seed on a version, see leaderboard.js ?>
    <section class="leaderboard" aria-labelledby="leaderboard-title" data-seed="<?= $seed ?>"
        data-version="<?= $version ?>">
        <h2 id="leaderboard-title"><?= $open ? 'Leaderboard of the day' : 'Leaderboard' ?></h2>
        <p class="leaderboard__other-track" hidden>
            You are riding another track: these ghosts only race on track <?= $seed ?>.
            <a href="<?= h(site_endurance_url($seed, $version)) ?>">Ride it again</a> to race
            them.
        </p>
        <p class="muted">
            <?php if (!$open): ?>
                The day of this track is over: its leaderboard is closed.
            <?php elseif ($user === null): ?>
                <a href="/login/?next=<?= rawurlencode(site_endurance_url($seed, $version)) ?>">Log
                    in</a>
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
            <a href="<?= h(site_endurance_url($seed, $version)) ?>">the link of this track</a>.
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
