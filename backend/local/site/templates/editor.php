<?php
/**
 * Editor page: the game editing a new track, or a draft. The game has the page as base URL, so
 * that the site answers its uploads and its download of the draft, see site_game_request(); an
 * upload opens the page of the upload.
 *
 * In an editing session (`?collab=`), the accounts with its link edit the track together, the
 * first one giving the track, e.g. its draft; the others join from `/create/?collab=`. Each one
 * uploads to their own account, the others who edited being credited.
 *
 * @var array|null  $draft       Draft to edit, see site_find_upload(); null for a new track.
 * @var string|null $collab      Editing session of the page, see site_collab_data().
 * @var string|null $collabToken Token of the account for that session.
 * @var string|null $newCollab   Page starting a new editing session.
 */

$page = $draft === null ? '/create/' : '/drafts/' . (int) $draft['ID'] . '/';
$attributes = $draft === null
    ? ['base-url' => '/create/', 'track-url' => '/uploads/{id}/']
    : [
        'base-url' => $page,
        'track-id' => (int) $draft['ID'],
        'track-mode' => 'edit',
        'track-url' => '/uploads/{id}/',
    ];
if ($collab !== null) {
    $attributes['live-url'] = site_live_url();
    $attributes['live-token'] = $collabToken;
}
?>
<?php if ($draft === null): ?>
    <h1>Create a track</h1>
<?php else: ?>
    <h1><?= h($draft['TITLE']) ?> <span class="muted">&middot; draft</span></h1>
<?php endif; ?>

<?php if ($collab !== null): ?>
    <?php // The link of the session joins it on the page of a new track, whose track it loads ?>
    <p class="share share-bar live-bar">
        <a class="button button--accent" href="/create/?collab=<?= h(rawurlencode($collab)) ?>"
            data-share data-share-text="Edit this OpenRider track with me!">Invite editors</a>
        <span>Editing together: everyone logged in with the link edits this track with you.</span>
        <a class="button" href="<?= h($page) ?>">Leave</a>
        <span class="share__status muted" role="status"></span>
    </p>
<?php elseif ($newCollab !== null): ?>
    <p class="live-bar">
        <a class="button" href="<?= h($newCollab) ?>">Edit together</a>
        <span class="muted">
            Start a session and send its link: you see each other's edits and cursors, and every
            editor is credited on the uploaded track.
        </span>
    </p>
<?php endif; ?>

<?php site_render('partials/game', ['attributes' => $attributes]); ?>

<?php if ($draft === null): ?>
    <p class="game-help muted">
        Draw your track with the tools of the editor, then upload it. Upload its track code to
        publish it with a title and a description, ready to be raced on its own page; upload its
        editor file to save it as a draft, keeping its layers to go on later.
        <?php if ($collab !== null): ?>
            In an editing session, each editor uploads to their own account, the others who edited
            the track being credited.
        <?php endif; ?>
    </p>
<?php else: ?>
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
