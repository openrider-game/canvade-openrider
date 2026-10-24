<?php
/**
 * Page showing a message, e.g. when a form cannot be sent.
 *
 * @var string $title Title of the page.
 * @var string $text  Message.
 */
?>
<h1><?= h($title) ?></h1>
<p class="muted"><?= h($text) ?></p>
<p><a class="button" href="/">Back to the tracks</a></p>
