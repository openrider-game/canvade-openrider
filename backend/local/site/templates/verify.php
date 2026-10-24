<?php
/**
 * Verification page of a track waiting for it: the game racing the track, where its verifier
 * saves the run verifying it, and the actions of its author and verifier.
 *
 * The page reloads when the verification changes, see `public/js/verification.js`, and the
 * verifying run races as a ghost with the button of the leaderboards, see
 * `public/js/leaderboard.js`: its id is the one of the track.
 *
 * @var array  $upload Track waiting for verification, see site_find_any_upload().
 * @var array  $user   Logged in account: its author, its verifier or an admin.
 * @var string $state  `pending`, `review` or `verified`, see site_verification_state().
 */

$id = (int) $upload['ID'];
$isAuthor = (int) $upload['USERID'] === $user['ID'];
$isVerifier = (int) $upload['VERIFIERID'] === $user['ID'];
$verifier = h($upload['VERIFIER'] ?? 'its verifier');
?>
<h1>
    <?= h($upload['TITLE']) ?>
    <span class="muted">
        &middot; <?= h(site_track_bike($upload['CODE'])) ?>
        &middot; by <?= h($upload['AUTHOR'] ?? 'nobody') ?>
    </span>
</h1>

<p class="track-description"><?= nl2br(h($upload['DESCRIPTION'])) ?></p>

<section class="verification" data-verification-id="<?= $id ?>"
    data-verification-state="<?= h($state) ?>" aria-labelledby="verification-title">
    <h2 id="verification-title">Verification</h2>

    <?php if ($state === 'pending' && $isVerifier): ?>
        <p>
            <strong>Finish the track and save your time to verify it.</strong> Going back to the
            checkpoints is fine: the finished run is replayed from the start to check it.
        </p>
    <?php elseif ($state === 'pending'): ?>
        <p>
            Waiting for <?= $verifier ?> to finish the track. You can race it meanwhile, but
            only the run of the verifier verifies it.
        </p>
    <?php else: ?>
        <p>
            Verified by <?= $verifier ?> in
            <?= site_duration((int) $upload['VERIFICATIONTIME']) ?>.
            <?php if ($state === 'review'): ?>
                The inputs of the run look unusual: an admin checks it before the track can be
                published.
            <?php elseif ($isAuthor): ?>
                You can publish the track.
            <?php else: ?>
                Waiting for its author to publish it.
            <?php endif; ?>
        </p>
        <p>
            <button class="button leaderboard__rider" type="button" data-ghost-id="<?= $id ?>"
                aria-pressed="false">Race against the verifying run</button>
        </p>
        <p class="leaderboard__status muted" role="status"></p>
    <?php endif; ?>

    <div class="verification__actions">
        <?php if ($isAuthor && $state === 'verified'): ?>
            <form method="post" action="/verify/<?= $id ?>/publish/">
                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                <button class="button" type="submit">Publish the track</button>
            </form>
        <?php endif; ?>

        <?php if ($isAuthor && $state === 'pending'): ?>
            <form class="verification__verifier" method="post"
                action="/verify/<?= $id ?>/verifier/">
                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                <label class="field__label" for="verify-verifier">Verifier</label>
                <input class="field__input" id="verify-verifier" name="verifier" type="text"
                    required value="<?= h($upload['VERIFIER'] ?? '') ?>" />
                <button class="button" type="submit">Give the verification</button>
            </form>
        <?php endif; ?>

        <?php if ($isVerifier && !$isAuthor && $state === 'pending'): ?>
            <form method="post" action="/verify/<?= $id ?>/decline/"
                onsubmit="return confirm('Give the verification back to the author of the track?')">
                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                <button class="button" type="submit">Decline the verification</button>
            </form>
        <?php endif; ?>

        <?php if ($isAuthor): ?>
            <?php site_render('partials/delete-form', [
                'action' => "/drafts/$id/delete/",
                'label' => 'Delete the track',
                'confirm' => 'Delete this track and its verification?',
            ]); ?>
        <?php endif; ?>
    </div>
</section>

<?php site_render('partials/game', ['attributes' => [
    'base-url' => "/verify/$id/",
    'track-id' => $id,
]]); ?>
