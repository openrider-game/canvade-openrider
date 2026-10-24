<?php
/**
 * Editor page: the game editing a new track, or a draft. The game has the page as base URL, so
 * that the site answers its uploads and its download of the draft, see site_game_request(); an
 * upload opens the page of the upload.
 *
 * @var array|null $draft Draft to edit, see site_find_upload(); null for a new track.
 */
?>
<?php if ($draft === null): ?>
    <h1>Create a track</h1>

    <?php site_render('partials/game', ['attributes' => [
        'base-url' => '/create/',
        'track-url' => '/uploads/{id}/',
    ]]); ?>

    <p class="game-help muted">
        Draw your track with the tools of the editor, then upload it. Upload its track code to
        publish it with a title and a description, ready to be raced on its own page; upload its
        editor file to save it as a draft, keeping its layers to go on later.
    </p>
<?php else: ?>
    <h1><?= h($draft['TITLE']) ?> <span class="muted">&middot; draft</span></h1>

    <?php site_render('partials/game', ['attributes' => [
        'base-url' => '/drafts/' . (int) $draft['ID'] . '/',
        'track-id' => (int) $draft['ID'],
        'track-mode' => 'edit',
        'track-url' => '/uploads/{id}/',
    ]]); ?>

    <p class="game-help muted">
        Upload the editor file of the track to save your changes to this draft, or its track code
        to publish it with a title and a description, keeping the draft.
        <a href="/uploads/<?= (int) $draft['ID'] ?>/track.openrider.json" download>Download the
        editor file</a> to keep a copy.
    </p>

    <?php site_render('partials/delete-form', [
        'action' => '/drafts/' . (int) $draft['ID'] . '/delete/',
        'label' => 'Delete the draft',
        'confirm' => 'Delete this draft?',
    ]); ?>
<?php endif; ?>
