<?php
/**
 * Templates page: the templates of the account, private or public, which it makes public or
 * private and deletes, then the public templates of every account, each card showing the
 * thumbnail of the template. The code of a template is copied to be pasted in the editor with
 * Ctrl+V; the editor also inserts them from the Templates panel of its select tool.
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
        <ul class="track-grid">
            <?php foreach ($mine as $template): ?>
                <li><?php site_render('partials/template-card', ['card' => $template, 'mine' => true]); ?></li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>
<?php endif; ?>

<h2>Public templates</h2>
<?php if (!$public): ?>
    <p class="muted">No public template yet.</p>
<?php else: ?>
    <ul class="track-grid">
        <?php foreach ($public as $template): ?>
            <li><?php site_render('partials/template-card', ['card' => $template, 'mine' => false]); ?></li>
        <?php endforeach; ?>
    </ul>
<?php endif; ?>
