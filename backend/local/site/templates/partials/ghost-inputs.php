<?php
/**
 * Inputs of a run, drawn by `public/js/ghost-inputs.js` from its ghost string: a timeline of
 * the presses of each key, zoomable, and the durations of the presses. The ghost string being
 * the inputs the verifier replays, they are the real inputs of the run.
 *
 * @var string $ghostString Ghost string of the run.
 */
?>
<div class="ghost-inputs" data-ghost-string="<?= h($ghostString) ?>">
    <p class="ghost-inputs__summary muted">Loading the inputs...</p>
    <div class="ghost-inputs__tools">
        <label class="ghost-inputs__zoom">
            Zoom
            <input type="range" min="1" max="12" step="1" value="1" />
        </label>
        <span class="ghost-inputs__legend muted">
            <span class="ghost-inputs__swatch"></span> press
            <span class="ghost-inputs__swatch ghost-inputs__swatch--tick"></span> press of a single tick
        </span>
    </div>
    <?php // The names of the keys stay in view while the timeline scrolls ?>
    <div class="ghost-inputs__frame">
        <ul class="ghost-inputs__keys" aria-hidden="true">
            <li>Up</li>
            <li>Down</li>
            <li>Left</li>
            <li>Right</li>
            <li>Turn</li>
        </ul>
        <div class="ghost-inputs__scroll">
            <canvas class="ghost-inputs__timeline" role="img"
                aria-label="Timeline of the keys pressed during the run"></canvas>
        </div>
    </div>
    <h3 class="ghost-inputs__heading">Durations of the presses</h3>
    <p class="muted">
        Played by hand, the presses spread over many durations; a program often holds them for the
        same few ticks, a tick being 20 ms.
    </p>
    <table class="ghost-inputs__histogram">
        <thead>
            <tr>
                <th scope="col">Held</th>
                <th scope="col">Presses</th>
                <th scope="col"><span class="visually-hidden">Share</span></th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
    <noscript><p class="muted">The inputs are drawn with JavaScript.</p></noscript>
</div>
