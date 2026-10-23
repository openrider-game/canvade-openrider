<?php
/** Editor page: the game editing a new track, its upload opening the page of the track. */
?>
<h1>Create a track</h1>

<?php site_render('partials/game', ['trackId' => null]); ?>

<p class="game-help muted">
    Draw your track with the tools of the editor, then upload it to publish it: it opens on its
    own page, ready to be raced.
</p>
