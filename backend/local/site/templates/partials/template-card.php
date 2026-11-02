<?php
/**
 * Card of a template: its thumbnail, name, author and number of objects, with the button copying
 * its code, and for its own account the buttons making it public or private and deleting it.
 *
 * @var array $card Template, see site_find_template_list().
 * @var bool  $mine Whether it is a template of the account viewing the page.
 */

$id = (int) $card['ID'];
$isPublic = (bool) $card['PUBLIC'];
?>
<div class="track-card template-card">
    <?php if ($card['HASTHUMBNAIL']): ?>
        <img class="track-card__thumbnail" src="/templates/<?= $id ?>/thumbnail/" alt=""
            width="500" height="300" loading="lazy" />
    <?php else: ?>
        <span class="track-card__thumbnail track-card__thumbnail--empty">No preview</span>
    <?php endif; ?>
    <span class="track-card__info">
        <span class="track-card__title"><?= h($card['NAME']) ?></span>
        <span class="track-card__meta">
            <?php $objects = (int) $card['OBJECTS']; ?>
            <?= $objects ?> <?= $objects === 1 ? 'object' : 'objects' ?>
            <?php if ($mine): ?>
                &middot; seen by <?= $isPublic ? 'everyone' : 'you only' ?>
            <?php else: ?>
                &middot; by
                <a href="/users/<?= h(rawurlencode($card['AUTHOR'])) ?>/"><?= h($card['AUTHOR']) ?></a>
            <?php endif; ?>
        </span>
    </span>
    <span class="template-card__actions">
        <button class="button" type="button" data-template-code="/templates/<?= $id ?>/code/">
            Copy code
        </button>
        <?php if ($mine): ?>
            <form method="post" action="/templates/<?= $id ?>/<?= $isPublic ? 'private' : 'public' ?>/">
                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                <button class="button" type="submit">
                    <?= $isPublic ? 'Make private' : 'Make public' ?>
                </button>
            </form>
            <?php site_render('partials/delete-form', [
                'action' => "/templates/$id/delete/",
                'label' => 'Delete',
                'confirm' => 'Delete the template ' . $card['NAME'] . '?',
            ]); ?>
        <?php endif; ?>
    </span>
</div>
