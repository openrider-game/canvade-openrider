<?php
/**
 * Ghosts page: the ghosts of every track, in two tabs, the newest ones and the most liked ones
 * (`?sort=liked`), with the links to the other pages of the list. A ghost opens its track racing
 * it, and its rider their page.
 *
 * @var bool    $mostLiked Whether the tab of the most liked ghosts is open.
 * @var int     $count     Number of ghosts listed.
 * @var int     $page      Page shown, from 1.
 * @var int     $pages     Number of pages, 1 at least.
 * @var array[] $ghosts    Ghosts of the page, see site_find_ghost_list().
 * @var array   $thumbed   Ghosts the account thumbs up, by id, see site_find_thumbed().
 */

$viewer = site_user();
$tabs = [
    '/ghosts/' => ['Newest ghosts', !$mostLiked],
    '/ghosts/?sort=liked' => ['Most liked', $mostLiked],
];

/** URL of a page of the list, keeping its order. */
$pageUrl = function (int $page) use ($mostLiked): string {
    $query = array_filter([
        'sort' => $mostLiked ? 'liked' : null,
        'page' => $page > 1 ? $page : null,
    ]);
    return '/ghosts/' . ($query ? '?' . http_build_query($query) : '');
};
?>
<h1>Ghosts</h1>

<nav class="tabs" aria-label="Order of the ghosts">
    <?php foreach ($tabs as $url => [$label, $current]): ?>
        <a class="tabs__tab" href="<?= h($url) ?>" <?= $current ? 'aria-current="page"' : '' ?>>
            <?= h($label) ?>
        </a>
    <?php endforeach; ?>
</nav>

<?php if (!$ghosts): ?>
    <p class="muted">No ghost yet: finish a track and save your time to be the first one.</p>
<?php else: ?>
    <p class="muted">
        <?= site_ghost_count($count) ?>. Click a track to race its ghost.
    </p>
    <table class="leaderboard__table">
        <thead>
            <tr>
                <th scope="col">Track</th>
                <th scope="col">Rider</th>
                <th scope="col">Rank</th>
                <th scope="col" class="leaderboard__time">Time</th>
                <th scope="col">Thumbs up</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($ghosts as $ghost): ?>
                <?php
                // The track racing the ghost from the start, as a shared link
                $race = '/tracks/' . (int) $ghost['TRACKID'] . '/?ghosts=' . (int) $ghost['ID'];
                ?>
                <tr>
                    <td>
                        <a href="<?= h($race) ?>">
                            <?= h(site_track_title(['ID' => $ghost['TRACKID']] + $ghost)) ?>
                        </a>
                    </td>
                    <td>
                        <?php if ($ghost['RIDER'] !== null): ?>
                            <a href="/users/<?= rawurlencode($ghost['RIDER']) ?>/">
                                <?= h($ghost['RIDER']) ?>
                            </a>
                        <?php else: ?>
                            <?php // Saved without the site: the name of its ghost string ?>
                            <?= h(site_ghost_name($ghost['GHOSTSTRING'])) ?>
                        <?php endif; ?>
                    </td>
                    <td><?= (int) $ghost['RANK'] ?></td>
                    <td class="leaderboard__time"><?= site_duration((int) $ghost['TIME']) ?></td>
                    <td>
                        <?php site_render('partials/thumbs', [
                            'kind' => 'ghosts',
                            'id' => (int) $ghost['ID'],
                            'count' => (int) $ghost['THUMBS'],
                            'thumbed' => isset($thumbed[(int) $ghost['ID']]),
                            'can' => site_can_thumb($viewer, $ghost),
                        ]); ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>

    <?php if ($pages > 1): ?>
        <nav class="pagination" aria-label="Pages of the ghosts">
            <?php if ($page > 1): ?>
                <a class="button" href="<?= h($pageUrl($page - 1)) ?>">Previous</a>
            <?php endif; ?>
            <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
            <?php if ($page < $pages): ?>
                <a class="button" href="<?= h($pageUrl($page + 1)) ?>">Next</a>
            <?php endif; ?>
        </nav>
    <?php endif; ?>
<?php endif; ?>
