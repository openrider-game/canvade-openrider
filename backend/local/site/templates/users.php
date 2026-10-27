<?php
/**
 * Users page: the accounts by name, each opening its page, with a search by name and the links
 * to the other pages of the list.
 *
 * @var string  $search Searched text, empty for every account.
 * @var int     $count  Number of accounts found.
 * @var int     $page   Page shown, from 1.
 * @var int     $pages  Number of pages, 1 at least.
 * @var array[] $users  Accounts of the page, see site_find_users().
 */

/** URL of a page of the list, keeping the search. */
$pageUrl = function (int $page) use ($search): string {
    $query = array_filter(['q' => $search, 'page' => $page > 1 ? $page : null]);
    return '/users/' . ($query ? '?' . http_build_query($query) : '');
};
?>
<h1>Users</h1>

<form class="users-search" method="get" action="/users/" role="search">
    <label class="visually-hidden" for="users-search">User name</label>
    <input class="field__input" id="users-search" name="q" type="search"
        placeholder="User name" value="<?= h($search) ?>" />
    <button class="button" type="submit">Search</button>
</form>

<?php if (!$users): ?>
    <p class="muted">
        <?= $search === '' ? 'No account yet.' : 'No user name holds "' . h($search) . '".' ?>
    </p>
<?php else: ?>
    <p class="muted">
        <?= $count ?> <?= $count === 1 ? 'account' : 'accounts' ?>
        <?php if ($search !== ''): ?>
            holding "<?= h($search) ?>" &middot; <a href="/users/">all the accounts</a>
        <?php endif; ?>
    </p>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">User</th>
                    <th scope="col" class="users__count">Tracks</th>
                    <th scope="col" class="users__count">Ghosts</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($users as $listed): ?>
                    <tr>
                        <td>
                            <a href="/users/<?= rawurlencode($listed['NAME']) ?>/">
                                <?= h($listed['NAME']) ?>
                            </a>
                        </td>
                        <td class="users__count"><?= (int) $listed['TRACKS'] ?></td>
                        <td class="users__count"><?= (int) $listed['GHOSTS'] ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($pages > 1): ?>
        <nav class="pagination" aria-label="Pages of the users">
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
