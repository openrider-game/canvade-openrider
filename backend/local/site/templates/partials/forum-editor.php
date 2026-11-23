<?php
/**
 * Text of a forum post being written, with its preview under it, formatted by the site as the
 * post will show (see `forum-editor.js`), and a reminder of the formatting.
 *
 * @var string  $text  Text written so far.
 * @var ?string $error Why the text was refused.
 * @var string  $label Label of the field.
 */
?>
<div class="field forum-editor">
    <label class="field__label" for="forum-text"><?= h($label) ?></label>
    <textarea class="field__input forum-editor__text" id="forum-text" name="text" rows="8" required
        maxlength="<?= SITE_FORUM_POST_MAX ?>" aria-describedby="forum-text-help"
        <?php if ($error !== null): ?>aria-invalid="true"<?php endif; ?>><?= h($text) ?></textarea>
    <?php if ($error !== null): ?>
        <p class="field__error" role="alert"><?= h($error) ?></p>
    <?php endif; ?>
    <p class="field__help muted" id="forum-text-help">
        <code>**bold**</code>, <code>*italic*</code>, <code>`code`</code>, <code>```</code> around
        a block of code, <code>&gt;</code> to quote, <code>-</code> for a list,
        <code>[text](https://...)</code> for a link. A line with only the address of a track or a
        ghost shows its card.
    </p>
    <div class="forum-editor__preview" aria-live="polite" hidden>
        <p class="field__label">Preview</p>
        <div class="forum-post__body"></div>
    </div>
</div>
