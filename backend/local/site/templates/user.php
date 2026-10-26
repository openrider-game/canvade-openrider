<?php
/**
 * Account page: the tracks published by an account and its ghosts.
 *
 * @var int     $userId Id of the account.
 * @var string  $name   User name.
 * @var array[] $tracks Tracks of the account, newest first, see site_find_tracks().
 * @var array[] $ghosts Ghosts of the account, newest first, see site_find_user_ghosts(): those
 *                      waiting for an admin only for the account itself and the admins.
 * @var array   $thumbed Ghosts the account looking thumbs up, by id, see site_find_thumbed().
 */

$viewer = site_user();
?>
<h1><?= h($name) ?></h1>

<?php if (site_can_delete($viewer, $userId)): ?>
    <?php site_render('partials/delete-form', [
        'action' => '/users/' . rawurlencode($name) . '/delete/',
        'label' => 'Delete the account',
        'confirm' => "Delete the account $name, with all its tracks, ghosts and drafts?",
    ]); ?>
<?php endif; ?>

<h2>Tracks</h2>
<?php if (!$tracks): ?>
    <p class="muted">No track published yet.</p>
<?php else: ?>
    <ul class="track-grid">
        <?php foreach ($tracks as $track): ?>
            <li><?php site_render('partials/track-card', ['track' => $track]); ?></li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>

<h2>Ghosts</h2>
<?php if (!$ghosts): ?>
    <p class="muted">No ghost saved yet.</p>
<?php else: ?>
    <table class="leaderboard__table">
        <thead>
            <tr>
                <th scope="col">Track</th>
                <th scope="col">Rank</th>
                <th scope="col" class="leaderboard__time">Time</th>
                <th scope="col">Thumbs up</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($ghosts as $ghost): ?>
                <tr>
                    <td>
                        <?php // The track racing the ghost from the start, as a shared link ?>
                        <?php
                        $race = '/tracks/' . (int) $ghost['TRACKID'] . '/?ghosts=' . (int) $ghost['ID'];
                        ?>
                        <a href="<?= h($race) ?>">
                            <?= h(site_track_title(['ID' => $ghost['TRACKID']] + $ghost)) ?>
                        </a>
                    </td>
                    <?php if ($ghost['REVIEW'] === null): ?>
                        <td><?= (int) $ghost['RANK'] ?></td>
                    <?php else: ?>
                        <td><span class="badge badge--review">checked by an admin</span></td>
                    <?php endif; ?>
                    <td class="leaderboard__time"><?= site_duration((int) $ghost['TIME']) ?></td>
                    <td>
                        <?php site_render('partials/thumbs', [
                            'kind' => 'ghosts',
                            'id' => (int) $ghost['ID'],
                            'count' => (int) $ghost['THUMBS'],
                            'thumbed' => isset($thumbed[(int) $ghost['ID']]),
                            // The ghosts of the page are all of its account
                            'can' => site_can_thumb($viewer, ['USERID' => $userId] + $ghost),
                        ]); ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
