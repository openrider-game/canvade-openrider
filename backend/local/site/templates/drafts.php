<?php
/**
 * Drafts page: the tracks waiting for verification that the account made or verifies, each card
 * opening its verification page, then the editor files saved as drafts, each card opening its
 * editor page.
 *
 * @var array   $user    Logged in account.
 * @var array[] $pending Tracks waiting for verification, see site_find_pending_tracks().
 * @var array[] $drafts  Drafts, newest first, see site_find_drafts().
 */
?>
<?php if ($pending): ?>
    <h1>Waiting for verification</h1>
    <ul class="track-grid">
        <?php foreach ($pending as $track): ?>
            <?php
            if ($track['VERIFICATIONTIME'] !== null) {
                $state = $track['REVIEW'] === null
                    ? 'Verified, ready to publish'
                    : 'Verified, checked by an admin';
            } elseif ((int) $track['VERIFIERID'] === $user['ID']) {
                $state = 'To verify by you';
            } else {
                $state = 'Waiting for ' . ($track['VERIFIER'] ?? 'its verifier');
            }
            ?>
            <li>
                <a class="track-card" href="/verify/<?= (int) $track['ID'] ?>/">
                    <?php if ($track['THUMBNAIL']): ?>
                        <img class="track-card__thumbnail"
                            src="data:image/png;base64,<?= h($track['THUMBNAIL']) ?>" alt=""
                            width="500" height="300" />
                    <?php else: ?>
                        <span class="track-card__thumbnail track-card__thumbnail--empty">
                            No thumbnail
                        </span>
                    <?php endif; ?>
                    <span class="track-card__info">
                        <span class="track-card__title"><?= h($track['TITLE']) ?></span>
                        <span class="track-card__meta">
                            by <?= h($track['AUTHOR'] ?? 'nobody') ?> &middot; <?= h($state) ?>
                        </span>
                    </span>
                </a>
            </li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>

<h1>Drafts</h1>

<?php if (!$drafts): ?>
    <p class="muted">
        No draft yet: upload the editor file of a track from the <a href="/create/">editor</a> to
        save it here.
    </p>
<?php else: ?>
    <p class="muted">
        Drafts cannot be raced: click one to go on editing it, then upload its track code to
        send it to verification.
    </p>
    <ul class="track-grid">
        <?php foreach ($drafts as $draft): ?>
            <li>
                <a class="track-card" href="/drafts/<?= (int) $draft['ID'] ?>/">
                    <?php if ($draft['THUMBNAIL']): ?>
                        <img class="track-card__thumbnail"
                            src="data:image/png;base64,<?= h($draft['THUMBNAIL']) ?>" alt=""
                            width="500" height="300" />
                    <?php else: ?>
                        <span class="track-card__thumbnail track-card__thumbnail--empty">
                            No thumbnail
                        </span>
                    <?php endif; ?>
                    <span class="track-card__info">
                        <span class="track-card__title"><?= h($draft['TITLE']) ?></span>
                        <span class="track-card__meta">
                            <?= nl2br(h($draft['DESCRIPTION'])) ?>
                        </span>
                    </span>
                </a>
            </li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>
