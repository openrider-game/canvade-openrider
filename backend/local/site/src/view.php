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
