<?php

/** Rendering of the templates of the sample website. */

/** Folder of the templates. */
const SITE_TEMPLATES_DIR = __DIR__ . '/../templates';

/**
 * Renders a template of `templates/`, its variables being the keys of `$data`.
 *
 * @param string $template Path of the template, without its `.php` extension.
 */
function site_render(string $template, array $data = []): void
{
    extract($data, EXTR_SKIP);
    require SITE_TEMPLATES_DIR . '/' . $template . '.php';
}

/**
 * URL of a script or stylesheet of the pages with the time its file changed (`?v=`), so that
 * browsers download it again after each deploy and keep it in their cache until then (see
 * site_serve_file() and `.htaccess`): `/assets/...` for the files of `public/`, `/dist/...` for
 * the build of the game. The other URLs, or a missing file, stay as they are.
 */
function site_asset_url(string $url): string
{
    $folders = ['/assets/' => SITE_PUBLIC_DIR, '/dist/' => SITE_GAME_DIST_DIR];
    foreach ($folders as $prefix => $dir) {
        if (strpos($url, $prefix) === 0) {
            $time = @filemtime($dir . '/' . substr($url, strlen($prefix)));
            return $time === false ? $url : $url . '?v=' . $time;
        }
    }

    return $url;
}

/**
 * Renders a page: a template of `templates/` in the layout of the site.
 *
 * @param string   $template Template of the page content.
 * @param string   $title    Title of the page.
 * @param array    $data     Variables of the template.
 * @param string[] $styles   Stylesheets of `public/css/` of the page, after `site.css`.
 * @param string[] $scripts  Scripts of the page, loaded in order after the document is parsed.
 */
function site_render_page(
    string $template,
    string $title,
    array $data = [],
    array $styles = [],
    array $scripts = []
): void {
    ob_start();
    site_render($template, $data);
    $content = ob_get_clean();

    site_render('layout', [
        'title' => $title,
        'content' => $content,
        'styles' => array_merge(['site.css'], $styles),
        'scripts' => $scripts,
    ]);
}
