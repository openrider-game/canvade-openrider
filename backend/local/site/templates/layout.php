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
                <?php $user = site_user(); ?>
                <?php if ($user !== null): ?>
                    <a class="site-header__user" href="/users/<?= rawurlencode($user['NAME']) ?>/">
                        <?= h($user['NAME']) ?>
                    </a>
                    <?php if (site_is_admin($user)): ?>
                        <a class="button" href="/reviews/">Reviews</a>
                    <?php endif; ?>
                    <a class="button" href="/drafts/">Drafts</a>
                    <a class="button" href="/create/">Create a track</a>
                    <form method="post" action="/logout/">
                        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                        <button class="button" type="submit">Log out</button>
                    </form>
                <?php else: ?>
                    <a class="button" href="/login/">Log in</a>
                    <a class="button" href="/register/">Register</a>
                <?php endif; ?>
            </nav>
        </div>
    </header>
    <main class="page">
        <?= $content ?>
    </main>
</body>
</html>
