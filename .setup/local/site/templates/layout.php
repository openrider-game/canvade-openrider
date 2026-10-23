<?php
/**
 * Layout of every page.
 *
 * @var string   $title   Title of the page.
 * @var string   $content HTML of the page content.
 * @var string[] $styles  Stylesheets of `public/css/`.
 * @var string[] $scripts Scripts, loaded in order after the document is parsed.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?= h($title) ?> - OpenRider</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <?php foreach ($styles as $style): ?>
        <link rel="stylesheet" href="/assets/css/<?= h($style) ?>" />
    <?php endforeach; ?>
    <?php foreach ($scripts as $script): ?>
        <script src="<?= h($script) ?>" defer></script>
    <?php endforeach; ?>
</head>
<body>
    <header class="site-header">
        <div class="site-header__inner">
            <a class="site-header__home" href="/">OpenRider</a>
            <nav class="site-header__nav">
                <a class="button" href="/create/">Create a track</a>
            </nav>
        </div>
    </header>
    <main class="page">
        <?= $content ?>
    </main>
</body>
</html>
