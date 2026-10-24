<?php
/**
 * Upload page: the form giving its title and description to a track uploaded by the editor
 * page, previewed by its thumbnail. A track code is sent to verification by the account named
 * in the form, an editor file saved as a draft.
 *
 * @var array    $upload  Upload, see site_find_upload().
 * @var bool     $isDraft Whether the upload is an editor file, saved as a draft.
 * @var string[] $values  Posted `title`, `description` and `verifier` (the account by default).
 * @var string[] $errors  Error messages of the invalid fields, by field, or of the whole `form`.
 */
?>
<h1><?= $isDraft ? 'Save a draft' : 'Send a track to verification' ?></h1>

<div class="upload">
    <?php if ($upload['THUMBNAIL']): ?>
        <img class="upload__thumbnail" src="data:image/png;base64,<?= h($upload['THUMBNAIL']) ?>"
            alt="Thumbnail of the track" width="500" height="300" />
    <?php endif; ?>

    <?php if ($isDraft): ?>
        <p class="muted">
            You uploaded an editor file: it keeps the layers of your track for the editor, but
            cannot be raced. Name it to save it as a draft, then open it from the drafts to go on
            editing it. Upload the track code to publish the track.
        </p>
    <?php else: ?>
        <p class="muted">
            Give your <?= h(site_track_bike($upload['CODE'])) ?> track a title and a description,
            and choose who verifies it: you, or another account. The track is published once its
            verifier finishes it, proving it can be finished; until then, only you and the verifier
            can race it.
        </p>
    <?php endif; ?>

    <!-- The browser checks the fields first, and the site again, see site_upload_page() -->
    <form method="post" action="/uploads/<?= (int) $upload['ID'] ?>/">
        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
        <?php if (isset($errors['form'])): ?>
            <p class="field__error" role="alert"><?= h($errors['form']) ?></p>
        <?php endif; ?>

        <div class="field">
            <label class="field__label" for="upload-title">Title</label>
            <input class="field__input" id="upload-title" name="title" type="text" required
                maxlength="<?= SITE_TITLE_MAX_LENGTH ?>" value="<?= h($values['title']) ?>"
                <?php if (isset($errors['title'])): ?>
                    aria-invalid="true" aria-describedby="upload-title-error"
                <?php endif; ?> />
            <?php if (isset($errors['title'])): ?>
                <p class="field__error" id="upload-title-error"><?= h($errors['title']) ?></p>
            <?php endif; ?>
        </div>

        <div class="field">
            <label class="field__label" for="upload-description">Description</label>
            <textarea class="field__input" id="upload-description" name="description" rows="5"
                required maxlength="<?= SITE_DESCRIPTION_MAX_LENGTH ?>"
                <?php if (isset($errors['description'])): ?>
                    aria-invalid="true" aria-describedby="upload-description-error"
                <?php endif; ?>><?= h($values['description']) ?></textarea>
            <?php if (isset($errors['description'])): ?>
                <p class="field__error" id="upload-description-error">
                    <?= h($errors['description']) ?>
                </p>
            <?php endif; ?>
        </div>

        <?php if (!$isDraft): ?>
            <div class="field">
                <label class="field__label" for="upload-verifier">Verifier</label>
                <input class="field__input" id="upload-verifier" name="verifier" type="text"
                    required value="<?= h($values['verifier']) ?>"
                    aria-describedby="upload-verifier-help<?= isset($errors['verifier'])
                        ? ' upload-verifier-error' : '' ?>"
                    <?php if (isset($errors['verifier'])): ?>aria-invalid="true"<?php endif; ?> />
                <p class="field__help muted" id="upload-verifier-help">
                    User name of the account finishing the track to verify it, yours by default.
                </p>
                <?php if (isset($errors['verifier'])): ?>
                    <p class="field__error" id="upload-verifier-error">
                        <?= h($errors['verifier']) ?>
                    </p>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <button class="button" type="submit">
            <?= $isDraft ? 'Save draft' : 'Send to verification' ?>
        </button>
    </form>
</div>
