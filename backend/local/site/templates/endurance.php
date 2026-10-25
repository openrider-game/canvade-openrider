<?php
/**
 * Endurance page: the game riding an infinite generated track, getting harder the further it
 * goes. The game shows the number of its track: the page rides a given number again, or the track
 * of the day, the same for everyone. The records are saved by the game in the browser.
 *
 * @var int|null $seed      Number of the track to ride, null for a new track on each load.
 * @var int      $dailySeed Number of the track of the day, see site_daily_endurance_seed().
 */

$attributes = ['base-url' => '/endurance/', 'game-mode' => 'endurance'];
if ($seed !== null) {
    $attributes['seed'] = $seed;
}
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

<div class="game-help muted">
    <p>
        The game shows the number of the track at its top right: ride it again, or share
        <?php if ($seed !== null): ?>
            <a href="/endurance/?seed=<?= $seed ?>">the link of this track</a>.
        <?php else: ?>
            its link, <code>/endurance/?seed=&lt;number&gt;</code>.
        <?php endif; ?>
        After a crash or a fall, <kbd>Enter</kbd> rides the same track again and <kbd>N</kbd> a
        new one. Your best rides, overall and on each track, are saved in this browser only.
    </p>
    <p>
        Besides boosts and slow motions, the track has launchers kicking the bike over wide gaps,
        and mud slowing it down. Its zones start with a status effect, lasting until the reset items
        ending the zone: low gravity, turbo, slippery wheels, heavy bike, no steering, mirrored
        leaning, invincibility over harsher bumps and bombs, engine off, or zero gravity.
    </p>
</div>
