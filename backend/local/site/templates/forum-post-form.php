<?php
/**
 * Form opening a topic, or editing a post (with the title of its topic for the first one).
 *
 * @var string   $heading   Title of the page.
 * @var string   $action    URL the form posts to.
 * @var string   $back      Page to go back to.
 * @var bool     $withTitle Whether the form has the title of the topic.
 * @var string   $title     Title written so far.
 * @var string   $text      Text written so far.
 * @var string[] $errors    Errors by field (`title`, `text`), or of the whole `form`.
 * @var string   $submit    Label of the button.
 */
?>
<p class="forum-breadcrumb"><a href="<?= h($back) ?>">Back</a></p>
<h1><?= h($heading) ?></h1>

<?php if (isset($errors['form'])): ?>
    <p class="field__error" role="alert"><?= h($errors['form']) ?></p>
<?php endif; ?>

<form class="forum-form" method="post" action="<?= h($action) ?>">
    <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
    <?php if ($withTitle): ?>
        <div class="field">
            <label class="field__label" for="forum-title">Title</label>
            <input class="field__input" id="forum-title" name="title" required
                minlength="<?= SITE_FORUM_TITLE_MIN ?>" maxlength="<?= SITE_FORUM_TITLE_MAX ?>"
                value="<?= h($title) ?>"
                <?php if (isset($errors['title'])): ?>aria-invalid="true"<?php endif; ?> />
            <?php if (isset($errors['title'])): ?>
                <p class="field__error" role="alert"><?= h($errors['title']) ?></p>
            <?php endif; ?>
        </div>
    <?php endif; ?>
    <?php site_render('partials/forum-editor', [
        'text' => $text,
        'error' => $errors['text'] ?? null,
        'label' => 'Text',
    ]); ?>
    <button class="button" type="submit"><?= h($submit) ?></button>
</form>
