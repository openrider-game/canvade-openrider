<?php
/**
 * Date and time of something of the forum, in UTC.
 *
 * @var int $time Unix timestamp.
 */
?>
<time datetime="<?= h(gmdate('c', $time)) ?>"><?= h(gmdate('Y-m-d H:i', $time)) ?> UTC</time>
