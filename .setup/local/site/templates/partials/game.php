<?php
/**
 * Host element of the game, set up by `/dist/main.js` (see GameConfig of the game): the backend
 * and the icons are at the root of the site, and an uploaded track opens its track page.
 *
 * @var int|null $trackId Track to race, null to edit a new track.
 */
?>
<div id="game" class="game" data-base-url="/" data-track-url="/tracks/{id}/"
    <?php if ($trackId !== null): ?>data-track-id="<?= (int) $trackId ?>"<?php endif; ?>></div>
