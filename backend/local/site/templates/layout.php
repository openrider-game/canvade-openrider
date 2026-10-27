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
    <script>
        // The theme picked with the button of the header, before the page is drawn (see theme.js)
        try {
            const theme = localStorage.getItem("openrider.theme");
            if (theme === "light" || theme === "dark") {
                document.documentElement.dataset.theme = theme;
            }
        } catch {
            // Storage blocked: the theme of the system
        }
    </script>
    <?php foreach ($styles as $style): ?>
        <link rel="stylesheet" href="/assets/css/<?= h($style) ?>" />
    <?php endforeach; ?>
    <script src="/assets/js/theme.js" defer></script>
    <?php foreach ($scripts as $script): ?>
        <script src="<?= h($script) ?>" defer></script>
    <?php endforeach; ?>
</head>
<body>
    <?php
    $user = site_user();
    $path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    // Sections of the site, each one current on its pages
    $sections = [
        ['Tracks', '/', $path === '/' || strpos($path, '/tracks/') === 0],
        ['Ghosts', '/ghosts/', strpos($path, '/ghosts/') === 0],
        ['Endurance', '/endurance/', strpos($path, '/endurance/') === 0],
        ['Users', '/users/', strpos($path, '/users/') === 0],
    ];
    ?>
    <header class="site-header">
        <div class="site-header__inner">
            <a class="site-header__home" href="/">OpenRider</a>
            <nav class="site-header__nav" aria-label="Sections">
                <?php foreach ($sections as [$label, $href, $current]): ?>
                    <a class="site-header__link" href="<?= $href ?>"
                        <?= $current ? 'aria-current="page"' : '' ?>><?= $label ?></a>
                <?php endforeach; ?>
            </nav>
            <div class="site-header__account">
                <a class="button" href="/create/">New track</a>
                <?php if ($user !== null): ?>
                    <details class="account-menu">
                        <summary class="button account-menu__toggle"><?= h($user['NAME']) ?></summary>
                        <div class="account-menu__panel">
                            <a href="/users/<?= rawurlencode($user['NAME']) ?>/">Profile</a>
                            <a href="/drafts/">Drafts</a>
                            <?php if (site_is_admin($user)): ?>
                                <a href="/reviews/">Reviews</a>
                            <?php endif; ?>
                            <form method="post" action="/logout/">
                                <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
                                <button type="submit">Log out</button>
                            </form>
                        </div>
                    </details>
                <?php else: ?>
                    <a class="site-header__link" href="/login/">Log in</a>
                    <a class="button" href="/register/">Register</a>
                <?php endif; ?>
                <button class="button theme-toggle" type="button" aria-pressed="false"
                    aria-label="Dark mode" title="Dark mode" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 14.5A9 9 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
                    </svg>
                </button>
            </div>
        </div>
    </header>
    <main class="page">
        <?= $content ?>
    </main>
</body>
</html>
