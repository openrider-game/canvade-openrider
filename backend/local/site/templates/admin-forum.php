<?php
/**
 * Categories of the forum, for the admins: each one edited, or deleted once without topics, and
 * a new one.
 *
 * @var array[] $categories See site_find_forum_categories().
 * @var ?string $error      Why the last change was refused.
 */

$csrf = h(site_csrf_token());

/** Fields of a category, empty for a new one. */
$fields = function (array $category, string $prefix): void { ?>
    <label class="field__label" for="<?= $prefix ?>-name">Name</label>
    <input class="field__input" id="<?= $prefix ?>-name" name="name" required maxlength="40"
        value="<?= h($category['NAME'] ?? '') ?>" />
    <label class="field__label" for="<?= $prefix ?>-description">Description</label>
    <input class="field__input" id="<?= $prefix ?>-description" name="description" maxlength="200"
        value="<?= h($category['DESCRIPTION'] ?? '') ?>" />
    <label class="field__label" for="<?= $prefix ?>-position">Position</label>
    <input class="field__input" id="<?= $prefix ?>-position" name="position" type="number"
        value="<?= (int) ($category['POSITION'] ?? 0) ?>" />
    <label>
        <input type="checkbox" name="staffOnly" <?= !empty($category['STAFFONLY']) ? 'checked' : '' ?> />
        Topics opened by the moderators only
    </label>
<?php };
?>
<h1>Forum categories</h1>
<p class="muted">
    Listed by position. Everyone replies in a category for the moderators, but only they open
    topics there. See also the <a href="/admin/users/">accounts</a> and the
    <a href="/admin/audit/">audit log</a>.
</p>
<?php if ($error !== null): ?>
    <p class="field__error" role="alert"><?= h($error) ?></p>
<?php endif; ?>

<?php foreach ($categories as $category): ?>
    <?php $id = (int) $category['ID']; ?>
    <section class="admin-forum__category">
        <h2>
            <?= h($category['NAME']) ?>
            <span class="muted">/forum/<?= h($category['SLUG']) ?>/ &middot; <?= (int) $category['TOPICS'] ?> topics</span>
        </h2>
        <form class="admin-forum__form" method="post" action="/admin/forum/categories/<?= $id ?>/save/">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <?php $fields($category, "category-$id"); ?>
            <button class="button" type="submit">Save</button>
        </form>
        <?php if ((int) $category['TOPICS'] === 0): ?>
            <?php site_render('partials/delete-form', [
                'action' => "/admin/forum/categories/$id/delete/",
                'label' => 'Delete',
                'confirm' => 'Delete the category ' . $category['NAME'] . '?',
            ]); ?>
        <?php endif; ?>
    </section>
<?php endforeach; ?>

<section class="admin-forum__category">
    <h2>New category</h2>
    <form class="admin-forum__form" method="post" action="/admin/forum/categories/new/">
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <label class="field__label" for="new-slug">Address</label>
        <input class="field__input" id="new-slug" name="slug" required
            pattern="[a-z0-9][a-z0-9\-]{0,29}" placeholder="e.g. events" />
        <?php $fields([], 'new'); ?>
        <button class="button" type="submit">Create</button>
    </form>
</section>
