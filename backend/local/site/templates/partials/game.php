<?php
/**
 * Host element of the game, set up by `/dist/main.js` with its data attributes (see GameConfig
 * of the game): e.g. `base-url`, `track-id`, `track-mode` and `track-url`.
 * Followed by a hint shown on the touch screens held upright, see `public/css/game.css`.
 *
 * @var array $attributes Values of the data attributes, by name without the `data-` prefix.
 */
?>
<div id="game" class="game"
    <?php foreach ($attributes as $name => $value): ?>
        data-<?= h($name) ?>="<?= h((string) $value) ?>"
    <?php endforeach; ?>></div>
<p class="game-rotate-hint">
    Turn your device sideways to play. Ride with the buttons at the bottom corners,
    drag with two fingers to look around and pinch to zoom.
</p>
