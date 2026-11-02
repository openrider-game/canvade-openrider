<?php
/**
 * Templates page: the templates of the account, private or public, which it makes public or
 * private and deletes, then the public templates of every account. The code of a template is
 * copied to be pasted in the editor with Ctrl+V; the editor also inserts them from the Templates
 * panel of its select tool.
 *
 * @var array[] $mine   Templates of the account, see site_find_template_list().
 * @var array[] $public Public templates of every account.
 */

$viewer = site_user();
?>
<h1>Templates</h1>
<p class="muted">
    Select objects in the editor with the select tool, then save them as a template to paste them
    in any track. Copy the code of a template to paste it in the editor with Ctrl+V, or insert it
    from the Templates panel of the select tool.
</p>

<?php if ($viewer !== null): ?>
    <h2>Your templates</h2>
    <?php if (!$mine): ?>
        <p class="muted">No template yet.</p>
    <?php else: ?>
        <div class="table-scroll">
            <table class="leaderboard__table">
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Objects</th>
                        <th scope="col">Seen by</th>
                        <th scope="col"><span class="visually-hidden">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($mine as $template): ?>
                        <?php
                        $id = (int) $template['ID'];
                        $isPublic = (bool) $template['PUBLIC'];
                        ?>
                        <tr>
                            <td><?= h($template['NAME']) ?></td>
                            <td><?= (int) $template['OBJECTS'] ?></td>
                            <td>
                                <form method="post"
                                    action="/templates/<?= $id ?>/<?= $isPublic ? 'private' : 'public' ?>/">
                                    <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                                    <?= $isPublic ? 'Everyone' : 'Only you' ?>
                                    <button class="button" type="submit">
                                        <?= $isPublic ? 'Make private' : 'Make public' ?>
                                    </button>
                                </form>
                            </td>
                            <td>
                                <button class="button" type="button"
                                    data-template-code="/templates/<?= $id ?>/code/">Copy code</button>
                                <?php site_render('partials/delete-form', [
                                    'action' => "/templates/$id/delete/",
                                    'label' => 'Delete',
                                    'confirm' => 'Delete the template ' . $template['NAME'] . '?',
                                ]); ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
<?php endif; ?>

<h2>Public templates</h2>
<?php if (!$public): ?>
    <p class="muted">No public template yet.</p>
<?php else: ?>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Author</th>
                    <th scope="col">Objects</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($public as $template): ?>
                    <tr>
                        <td><?= h($template['NAME']) ?></td>
                        <td>
                            <a href="/users/<?= h(rawurlencode($template['AUTHOR'])) ?>/">
                                <?= h($template['AUTHOR']) ?>
                            </a>
                        </td>
                        <td><?= (int) $template['OBJECTS'] ?></td>
                        <td>
                            <button class="button" type="button"
                                data-template-code="/templates/<?= (int) $template['ID'] ?>/code/">Copy code</button>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>
