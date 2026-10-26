<?php
/**
 * Header of a leaderboard table of the track page, see `partials/ghost-row.php`.
 *
 * @var array|null $user Logged in account, adding the column of the delete buttons.
 */
?>
<thead>
    <tr>
        <th scope="col">#</th>
        <th scope="col">Rider</th>
        <th scope="col">Bike</th>
        <th scope="col" class="leaderboard__time">Time</th>
        <th scope="col">Thumbs up</th>
        <?php if ($user !== null): ?>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
        <?php endif; ?>
    </tr>
</thead>
