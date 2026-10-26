<?php
/**
 * Track page: the game racing the track, and the leaderboard of its ghosts.
 *
 * The leaderboard has two tabs (see `public/js/leaderboard-tabs.js`): the top riders, ranked by
 * their best ghost, their other ghosts folded under it, and the ghosts of the account, with
 * those waiting for an admin. The riders are the accounts of the ghosts, or the names of their
 * ghost strings for the ghosts saved without the site. Clicking a rider toggles their ghost in
 * the game, see `public/js/leaderboard.js`. The run verifying the track is marked.
 *
 * @var array    $track      Track, see site_find_track().
 * @var array[]  $top        Best riders, best first, see site_group_riders().
 * @var int      $riderCount Number of riders ranked.
 * @var array[]  $mine       Ghosts of the account, fastest first, see site_find_ghosts().
 * @var int|null $myRank     Rank of the account among the riders, null when it has none.
 * @var array[]  $linked     Ghosts of a shared link, racing from the start, see
 *                           site_linked_ghosts().
 * @var int      $missing    Number of ghosts of the link that are not on the track.
 * @var bool     $trackThumbed Whether the account thumbs up the track.
 * @var array    $thumbed    Ghosts the account thumbs up, by id, see site_find_thumbed().
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

<div class="track-thumbs">
    <?php site_render('partials/thumbs', [
        'kind' => 'tracks',
        'id' => (int) $track['ID'],
        'count' => (int) $track['THUMBS'],
        'thumbed' => $trackThumbed,
        'can' => site_can_thumb($user, $track),
    ]); ?>
</div>

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

<?php if ($linked): ?>
    <?php $names = array_map(
        fn (array $ghost) => h($ghost['NAME']) . ' (' . site_duration((int) $ghost['TIME']) . ')',
        $linked
    ); ?>
    <p class="race-notice">
        Racing against <?= implode(', ', $names) ?>.
        <?php if ($missing > 0): ?>
            <span class="muted">
                <?= $missing ?> <?= $missing === 1 ? 'ghost' : 'ghosts' ?> of the link cannot be
                raced on this track.
            </span>
        <?php endif; ?>
    </p>
<?php elseif ($missing > 0): ?>
    <p class="race-notice muted">The ghosts of the link cannot be raced on this track.</p>
<?php endif; ?>

<?php
$title = site_track_title($track);
// Shared with the ghosts racing, or without any
$challenge = "Can you beat these ghosts on “{$title}”? Race them on OpenRider!";
$challengeAlone = "Can you finish “{$title}” faster than everyone on OpenRider?";
?>
<p class="share share-bar">
    <a class="button button--accent" href="/tracks/<?= (int) $track['ID'] ?>/" data-share-race
        data-share-text="<?= h($challenge) ?>" data-share-text-alone="<?= h($challengeAlone) ?>"
        >Challenge your friends</a>
    <span>The link races the ghosts racing now: pick them in the leaderboard.</span>
    <span class="share__status muted" role="status"></span>
</p>

<?php // Always given, so that the game never races the ghosts of the link left out ?>
<?php site_render('partials/game', ['attributes' => [
    'base-url' => '/tracks/' . (int) $track['ID'] . '/',
    'track-id' => (int) $track['ID'],
    'ghosts' => implode(',', array_column($linked, 'ID')),
]]); ?>

<section class="leaderboard" aria-labelledby="leaderboard-title">
    <h2 id="leaderboard-title">Leaderboard</h2>
    <p class="muted">Click a rider to race against their ghost, and again to remove it.</p>

    <?php // Shown by the script of the tabs, which hides the panel not selected ?>
    <div class="tabs" role="tablist" aria-labelledby="leaderboard-title" hidden>
        <button class="tabs__tab" type="button" role="tab" id="leaderboard-tab-top"
            aria-controls="leaderboard-top" aria-selected="true">Top riders</button>
        <button class="tabs__tab" type="button" role="tab" id="leaderboard-tab-mine"
            aria-controls="leaderboard-mine" aria-selected="false" tabindex="-1">My ghosts</button>
    </div>

    <div class="tabs__panel" role="tabpanel" id="leaderboard-top"
        aria-labelledby="leaderboard-tab-top">
        <h3 class="tabs__heading">Top riders</h3>
        <?php if (!$top): ?>
            <p class="muted">
                No ghost yet: finish the track and save your time to be the first one.
            </p>
        <?php else: ?>
            <p class="muted">
                The <?= count($top) ?> best of <?= $riderCount ?>
                <?= $riderCount === 1 ? 'rider' : 'riders' ?>, by their best time.
            </p>
            <table class="leaderboard__table">
                <?php site_render('partials/ghost-head', ['user' => $user]); ?>
                <tbody>
                    <?php foreach ($top as $rank => $rider): ?>
                        <?php
                        $group = 'rider-' . ($rank + 1);
                        $others = array_slice($rider['GHOSTS'], 1);
                        ?>
                        <?php site_render('partials/ghost-row', [
                            'track' => $track,
                            'ghost' => $rider['GHOSTS'][0],
                            'name' => $rider['NAME'],
                            'rank' => (string) ($rank + 1),
                            'user' => $user,
                            'thumbed' => $thumbed,
                            'group' => null,
                            'more' => $others ? ['group' => $group, 'count' => count($others)] : [],
                        ]); ?>
                        <?php foreach ($others as $ghost): ?>
                            <?php site_render('partials/ghost-row', [
                                'track' => $track,
                                'ghost' => $ghost,
                                'name' => $rider['NAME'],
                                'rank' => '',
                                'user' => $user,
                                'thumbed' => $thumbed,
                                'group' => $group,
                                'more' => [],
                            ]); ?>
                        <?php endforeach; ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <div class="tabs__panel" role="tabpanel" id="leaderboard-mine"
        aria-labelledby="leaderboard-tab-mine">
        <h3 class="tabs__heading">My ghosts</h3>
        <?php if ($user === null): ?>
            <?php $next = rawurlencode('/tracks/' . (int) $track['ID'] . '/'); ?>
            <p class="muted">
                <a href="/login/?next=<?= $next ?>">Log in</a> to save your times on the
                leaderboard and find them here.
            </p>
        <?php elseif (!$mine): ?>
            <p class="muted">No ghost yet: finish the track and save your time.</p>
        <?php else: ?>
            <p class="muted">
                <?php if ($myRank !== null): ?>
                    You rank <?= $myRank ?> of <?= $riderCount ?>
                    <?= $riderCount === 1 ? 'rider' : 'riders' ?> with your best time.
                <?php else: ?>
                    Your ghosts are checked by an admin before they rank.
                <?php endif; ?>
            </p>
            <table class="leaderboard__table">
                <?php site_render('partials/ghost-head', ['user' => $user]); ?>
                <tbody>
                    <?php $rankShown = false; ?>
                    <?php foreach ($mine as $ghost): ?>
                        <?php
                        // The rank of the account shows on its best ghost out of review
                        $ranked = !$rankShown && $myRank !== null && $ghost['REVIEW'] === null;
                        $rankShown = $rankShown || $ranked;
                        ?>
                        <?php site_render('partials/ghost-row', [
                            'track' => $track,
                            'ghost' => $ghost,
                            'name' => $user['NAME'],
                            'rank' => $ranked ? (string) $myRank : '',
                            'user' => $user,
                            'thumbed' => $thumbed,
                            'group' => null,
                            'more' => [],
                        ]); ?>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

    <p class="leaderboard__status muted" role="status"></p>
</section>
