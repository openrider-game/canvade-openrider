<?php
/**
 * Accounts page of the admins: the accounts searched by name, with their role, changed with its
 * form, and their suspension, given for a duration with a reason or lifted (see
 * site_admin_user_action()). The accounts an admin cannot act on show why, see
 * site_admin_refusal().
 *
 * @var string  $search Name searched, empty for every account.
 * @var int     $count  Number of accounts found.
 * @var int     $page   Page shown, from 1.
 * @var int     $pages  Number of pages.
 * @var array[] $users  Accounts of the page, see site_find_users().
 */

$admin = site_user();
$query = $search === '' ? '' : '?q=' . rawurlencode($search);
$pageUrl = function (int $page) use ($search): string {
    $params = array_filter(['q' => $search, 'page' => $page > 1 ? $page : null]);
    return '/admin/users/' . ($params ? '?' . http_build_query($params) : '');
};
$csrf = h(site_csrf_token());
?>
<h1>Accounts</h1>
<p class="muted">
    Moderators delete the tracks, ghosts and comments of the others and review the runs; admins
    also give the roles and suspend the accounts. A suspended account reads the site, but neither
    posts nor uploads. See also the <a href="/admin/audit/">audit log</a>.
</p>

<form class="users-search" method="get" action="/admin/users/" role="search">
    <label class="visually-hidden" for="admin-users-search">Name</label>
    <input class="field__input" id="admin-users-search" type="search" name="q"
        value="<?= h($search) ?>" placeholder="Search by name" />
    <button class="button" type="submit">Search</button>
</form>

<div class="table-scroll">
    <table class="leaderboard__table admin-users">
        <thead>
            <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Suspension</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($users as $user): ?>
                <?php
                $id = (int) $user['ID'];
                $role = site_role($user);
                $roleRefusal = site_admin_refusal($admin, $user, 'role');
                $suspendRefusal = site_admin_refusal($admin, $user, 'suspend');
                $suspended = site_is_suspended($user);
                ?>
                <tr>
                    <td>
                        <a href="/users/<?= rawurlencode($user['NAME']) ?>/"><?= h($user['NAME']) ?></a>
                        <span class="muted">
                            <?= (int) $user['TRACKS'] ?> tracks, <?= (int) $user['GHOSTS'] ?> ghosts
                        </span>
                    </td>
                    <td>
                        <?php if ($roleRefusal !== null): ?>
                            <?= h($role) ?>
                            <span class="muted" title="<?= h($roleRefusal) ?>">
                                <?= site_is_listed_admin($user) ? '(OPENRIDER_ADMINS)' : '(you)' ?>
                            </span>
                        <?php else: ?>
                            <form class="admin-users__form" method="post"
                                action="/admin/users/<?= $id ?>/role/<?= h($query) ?>">
                                <input type="hidden" name="csrf" value="<?= $csrf ?>" />
                                <label class="visually-hidden" for="role-<?= $id ?>">Role</label>
                                <select class="field__input" id="role-<?= $id ?>" name="role">
                                    <?php foreach (SITE_ROLES as $option): ?>
                                        <option value="<?= $option ?>" <?= $option === $role ? 'selected' : '' ?>>
                                            <?= $option ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                                <button class="button" type="submit">Set</button>
                            </form>
                        <?php endif; ?>
                    </td>
                    <td>
                        <?php if ($suspended): ?>
                            <p class="admin-users__status">
                                <?= (int) $user['SUSPENDEDUNTIL'] === 0
                                    ? 'Suspended for good'
                                    : 'Suspended until ' . h(gmdate('Y-m-d H:i', (int) $user['SUSPENDEDUNTIL'])) . ' UTC' ?>
                                <?php if ($user['SUSPENSIONREASON'] !== null): ?>
                                    <span class="muted">(<?= h($user['SUSPENSIONREASON']) ?>)</span>
                                <?php endif; ?>
                            </p>
                            <form method="post" action="/admin/users/<?= $id ?>/unsuspend/<?= h($query) ?>">
                                <input type="hidden" name="csrf" value="<?= $csrf ?>" />
                                <button class="button" type="submit">Lift</button>
                            </form>
                        <?php elseif ($suspendRefusal !== null): ?>
                            <span class="muted"><?= h($suspendRefusal) ?></span>
                        <?php else: ?>
                            <form class="admin-users__form" method="post"
                                action="/admin/users/<?= $id ?>/suspend/<?= h($query) ?>">
                                <input type="hidden" name="csrf" value="<?= $csrf ?>" />
                                <label class="visually-hidden" for="days-<?= $id ?>">Duration</label>
                                <select class="field__input" id="days-<?= $id ?>" name="days">
                                    <option value="1">1 day</option>
                                    <option value="7">7 days</option>
                                    <option value="30">30 days</option>
                                    <option value="0">For good</option>
                                </select>
                                <label class="visually-hidden" for="reason-<?= $id ?>">Reason</label>
                                <input class="field__input" id="reason-<?= $id ?>" name="reason"
                                    maxlength="<?= SITE_SUSPENSION_REASON_MAX ?>" placeholder="Reason, told to the account" />
                                <button class="button button--danger" type="submit">Suspend</button>
                            </form>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages of the accounts">
        <?php if ($page > 1): ?>
            <a href="<?= h($pageUrl($page - 1)) ?>">Previous</a>
        <?php endif; ?>
        <span class="muted">Page <?= $page ?> of <?= $pages ?>, <?= $count ?> accounts</span>
        <?php if ($page < $pages): ?>
            <a href="<?= h($pageUrl($page + 1)) ?>">Next</a>
        <?php endif; ?>
    </nav>
<?php endif; ?>
