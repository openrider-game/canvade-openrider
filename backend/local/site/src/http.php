<?php

/**
 * Helpers of the requests of the sample website: the checks of the posted forms and requests of
 * the game, the redirections and error pages, and the static files.
 */

/** Media types of the static files. */
const SITE_MEDIA_TYPES = [
    'css' => 'text/css; charset=UTF-8',
    'js' => 'text/javascript; charset=UTF-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
];

/**
 * Whether the request posts a form of the site, with its CSRF token; answers 405 or 403
 * otherwise.
 */
function site_check_posted_form(): bool
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        header('Allow: POST');
        return false;
    }
    if (!site_check_csrf()) {
        http_response_code(403);
        site_render_message('The form has expired', 'Go back, reload the page and send it again.');
        return false;
    }

    return true;
}

/**
 * The logged in account, or null after redirecting to the log in page, which opens the current
 * page again once logged in.
 */
function site_require_user(): ?array
{
    $user = site_user();
    if ($user === null) {
        $page = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        site_redirect('/login/?next=' . rawurlencode($page));
    }

    return $user;
}

/**
 * Answers 413 to a request of the game larger than the `post_max_size` of PHP, whose parameters
 * PHP drops, rather than telling they are missing.
 */
function site_check_post_size(): void
{
    if (!$_POST && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        openrider_respond(413, ['error' => 'The upload is larger than the server accepts']);
    }
}

/** The logged in account, or null after answering 401 to the request of the game. */
function site_require_api_user(string $message): ?array
{
    $user = site_user();
    if ($user === null) {
        openrider_respond(401, ['error' => $message]);
    }

    return $user;
}

/** A text field of the posted form, trimmed with `\n` line breaks, empty when missing. */
function site_form_text(string $name): string
{
    $value = $_POST[$name] ?? '';
    // Browsers post `\r\n` line breaks, but count them as one character in `maxlength`
    return is_string($value) ? trim(str_replace("\r\n", "\n", $value)) : '';
}

/** Answers 303 See Other, redirecting to a page of the site. */
function site_redirect(string $url): void
{
    http_response_code(303);
    header('Location: ' . $url);
}

/** Renders a page showing a message under its title. */
function site_render_message(string $title, string $text): void
{
    site_render_page('message', $title, ['title' => $title, 'text' => $text]);
}

/** Answers 404 with the not found page. */
function site_not_found(): void
{
    http_response_code(404);
    site_render_page('not-found', 'Page not found');
}

/** Serves a file of a folder, refusing the paths leading out of it. */
function site_serve_file(string $dir, string $relativePath): void
{
    $root = realpath($dir);
    $file = realpath($dir . '/' . $relativePath);
    $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));

    if (
        $root === false
        || $file === false
        || strpos($file, $root . DIRECTORY_SEPARATOR) !== 0
        || !is_file($file)
        || !isset(SITE_MEDIA_TYPES[$extension])
    ) {
        site_not_found();
        return;
    }

    header('Content-Type: ' . SITE_MEDIA_TYPES[$extension]);
    header('Content-Length: ' . filesize($file));
    readfile($file);
}
