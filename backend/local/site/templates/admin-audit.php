<?php
/**
 * Audit log page of the admins: what the moderators and the admins did, the newest first (see
 * db/audit.php).
 *
 * @var array[] $entries Entries of the page, see site_find_audit_page().
 * @var int     $page    Page shown, from 1.
 * @var int     $pages   Number of pages.
 */
?>
<h1>Audit log</h1>
<p class="muted">
    What the moderators and the admins did: the roles given, the suspensions, the content of the
    others deleted and the runs reviewed. Back to the <a href="/admin/users/">accounts</a>.
</p>

<?php if (!$entries): ?>
    <p class="muted">Nothing yet.</p>
<?php else: ?>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">When (UTC)</th>
                    <th scope="col">Who</th>
                    <th scope="col">Action</th>
                    <th scope="col">On</th>
                    <th scope="col">Details</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($entries as $entry): ?>
                    <tr>
                        <td><?= h(gmdate('Y-m-d H:i', (int) $entry['CREATED'])) ?></td>
                        <td><?= h($entry['ACTORNAME']) ?></td>
                        <td><?= h($entry['ACTION']) ?></td>
                        <td><?= h($entry['TARGET']) ?></td>
                        <td><?= h($entry['DETAILS']) ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages of the audit log">
        <?php if ($page > 1): ?>
            <a href="/admin/audit/?page=<?= $page - 1 ?>">Newer</a>
        <?php endif; ?>
        <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
        <?php if ($page < $pages): ?>
            <a href="/admin/audit/?page=<?= $page + 1 ?>">Older</a>
        <?php endif; ?>
    </nav>
<?php endif; ?>
