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
    <?php
    // What waits for the admins, counted on each of their pages (see site_count_reviews())
    $user = site_user();
    $reviewCount = site_can($user, 'moderate') ? site_count_reviews(openrider_db()) : 0;
    ?>
    <title><?= $reviewCount ? "($reviewCount) " : '' ?><?= h($title) ?> - OpenRider</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <?php if ($user !== null): ?>
        <script>
            // The preferences of the account, written to the storage of the browser before the
            // page and the game read them, unless changed in this browser since the account last
            // had them (`openrider.synced`, as stored, e.g. sent on a page left before the account
            // saved them): those are kept, then sent by settings-sync.js
            window.openriderAccount = <?= json_encode(
                site_account_settings($user),
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            ) ?>;
            try {
                const account = window.openriderAccount;
                let synced = JSON.parse(localStorage.getItem("openrider.synced") ?? "null");
                synced = synced?.user === account.user ? synced : { user: account.user };
                for (const name of ["theme", "controls"]) {
                    const key = "openrider." + name;
                    const local = localStorage.getItem(key);
                    // As stored: no theme stored for the one of the system
                    const remote = name === "theme" && account.theme === "system" ? null : account[name];
                    // Nothing stored, e.g. the storage cleared: the account's
                    const changedHere = name in synced && local !== null && local !== synced[name];
                    if (account[name] === null || (changedHere && local !== remote)) {
                        continue;
                    }
                    if (remote === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, remote);
                    }
                    synced[name] = remote;
                }
                localStorage.setItem("openrider.synced", JSON.stringify(synced));
            } catch {
                // Storage blocked: the theme is set below all the same
            }
        </script>
    <?php endif; ?>
    <script>
        // The theme picked with the button of the header, before the page is drawn (see theme.js)
        let theme = null;
        try {
            theme = localStorage.getItem("openrider.theme");
        } catch {
            // Storage blocked: the theme of the account, else of the system
        }
        theme = theme ?? window.openriderAccount?.theme;
        if (theme === "light" || theme === "dark") {
            document.documentElement.dataset.theme = theme;
        }
    </script>
    <?php foreach ($styles as $style): ?>
        <link rel="stylesheet" href="<?= h(site_asset_url("/assets/css/$style")) ?>" />
    <?php endforeach; ?>
    <script src="<?= h(site_asset_url('/assets/js/theme.js')) ?>" defer></script>
    <?php if ($user !== null): ?>
        <script src="<?= h(site_asset_url('/assets/js/settings-sync.js')) ?>" defer></script>
    <?php endif; ?>
    <?php foreach ($scripts as $script): ?>
        <script src="<?= h(site_asset_url($script)) ?>" defer></script>
    <?php endforeach; ?>
</head>
<body>
    <?php
    // The account, read in the head
    $path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    // Sections of the site, each one current on its pages
    $sections = [
        ['Tracks', '/', $path === '/' || strpos($path, '/tracks/') === 0],
        ['Ghosts', '/ghosts/', strpos($path, '/ghosts/') === 0],
        ['Endurance', '/endurance/', strpos($path, '/endurance/') === 0],
        ['Templates', '/templates/', strpos($path, '/templates/') === 0],
        ['Users', '/users/', strpos($path, '/users/') === 0],
        ['Forum', '/forum/', strpos($path, '/forum/') === 0],
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
                        <summary class="button account-menu__toggle">
                            <?= h($user['NAME']) ?>
                            <?php if ($reviewCount): ?>
                                <span class="badge badge--review"><?= $reviewCount ?></span>
                                <span class="visually-hidden">to review</span>
                            <?php endif; ?>
                        </summary>
                        <div class="account-menu__panel">
                            <a href="/users/<?= rawurlencode($user['NAME']) ?>/">Profile</a>
                            <a href="/drafts/">Drafts</a>
                            <a href="/settings/">Settings</a>
                            <?php if (site_can($user, 'moderate')): ?>
                                <a href="/reviews/">Reviews<?= $reviewCount ? " ($reviewCount)" : '' ?></a>
                            <?php endif; ?>
                            <?php if (site_can($user, 'manage_users')): ?>
                                <a href="/admin/users/">Accounts</a>
                                <a href="/admin/audit/">Audit log</a>
                                <a href="/admin/forum/">Forum categories</a>
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
        <?php if (site_is_suspended($user)): ?>
            <p class="suspension-notice" role="status"><?= h(site_suspension_message($user)) ?></p>
        <?php endif; ?>
        <?= $content ?>
    </main>
</body>
</html>
