<?php
/**
 * Thumbs up of a track or a ghost: a button giving or taking back the thumb of the account,
 * with their number, or only their number for the accounts that cannot thumb it up (see
 * site_can_thumb()). The button posts a form, sent by `public/js/thumbs.js` without leaving the
 * page.
 *
 * @var string $kind    Kind of the subject, a key of SITE_THUMB_KINDS: `tracks` or `ghosts`.
 * @var int    $id      Id of the track or ghost.
 * @var int    $count   Number of thumbs.
 * @var bool   $thumbed Whether the account gives one.
 * @var bool   $can     Whether the account can give one.
 */

$label = $count === 1 ? '1 thumb up' : "$count thumbs up";
// Back to the page of the button once done, without the script
$action = "/$kind/$id/thumb/?next=" . rawurlencode($_SERVER['REQUEST_URI'] ?? '/');
?>
<?php if ($can): ?>
    <form class="thumbs" method="post" action="<?= h($action) ?>">
        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
        <button class="button thumbs__button" type="submit"
            aria-pressed="<?= $thumbed ? 'true' : 'false' ?>"
            title="<?= $thumbed ? 'Take back your thumb up' : 'Give a thumb up' ?>">
            <span aria-hidden="true">👍</span>
            <span class="thumbs__count"><?= $count ?></span>
            <span class="visually-hidden">thumbs up</span>
        </button>
    </form>
<?php else: ?>
    <span class="thumbs thumbs--count muted" title="<?= h($label) ?>">
        <span aria-hidden="true">👍</span>
        <span class="thumbs__count"><?= $count ?></span>
        <span class="visually-hidden">thumbs up</span>
    </span>
<?php endif; ?>
