<?php
/**
 * Button deleting something with a posted form, after a confirmation, see site_delete().
 *
 * @var string $action  URL the form posts to, e.g. `/tracks/3/delete/`.
 * @var string $label   Text of the button.
 * @var string $confirm Question confirming the deletion.
 */
?>
<form class="delete-form" method="post" action="<?= h($action) ?>"
    onsubmit="return confirm(<?= h(json_encode($confirm)) ?>)">
    <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
    <button class="button button--danger" type="submit"><?= h($label) ?></button>
</form>
