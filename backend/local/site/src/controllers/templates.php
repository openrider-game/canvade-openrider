<?php

/**
 * Templates: the endpoint of the editor saving and listing them, and the templates page, listing
 * the templates of the account and the public ones (see db/templates.php).
 */

/**
 * Endpoint of the editor pages, posted with an `action`:
 *
 * - `list`: the templates of the account, then the public ones of the others, without their code;
 * - `get` with an `id`: the code of a template the account sees;
 * - `save` with a `name`, a `code`, `public` (`1` or `0`) and optionally a `thumbnail`, a base64
 *   500x300 PNG as the thumbnails of the tracks: saves a template of the account.
 */
function site_templates_endpoint(): void
{
    openrider_handle(function (PDO $db) {
        site_create_tables($db);
        $user = site_require_api_user('Log in to use the templates');
        $action = openrider_string_param('action');

        if ($action === 'list') {
            $mine = site_find_template_list($db, $user['ID']);
            $others = array_filter(
                site_find_template_list($db, null),
                fn (array $template) => (int) $template['USERID'] !== (int) $user['ID']
            );
            $format = fn (array $template) => [
                'ID' => (int) $template['ID'],
                'NAME' => $template['NAME'],
                'OBJECTS' => (int) $template['OBJECTS'],
                'PUBLIC' => (bool) $template['PUBLIC'],
                'AUTHOR' => $template['AUTHOR'],
                'MINE' => (int) $template['USERID'] === (int) $user['ID'],
            ];
            return ['TEMPLATES' => array_map($format, [...$mine, ...array_values($others)])];
        }

        if ($action === 'get') {
            $template = site_find_template($db, openrider_int_param('id'), $user['ID']);
            if ($template === null) {
                openrider_respond(404, ['error' => 'Template not found']);
            }
            return ['CODE' => $template['CODE']];
        }

        if ($action === 'save') {
            site_check_post_size();
            $name = trim(openrider_string_param('name'));
            // Counts characters, not bytes; invalid UTF-8 does not match either
            if (!preg_match('/^.{1,' . SITE_TEMPLATE_NAME_MAX . '}$/su', $name)) {
                openrider_reject(
                    'The name must be valid text of at most ' . SITE_TEMPLATE_NAME_MAX . ' characters'
                );
            }
            $code = openrider_string_param('code');
            if (strlen($code) > SITE_TEMPLATE_MAX_BYTES) {
                openrider_respond(413, ['error' => 'The template is too large']);
            }
            $objects = site_template_objects($code);
            if ($objects === null || $objects === 0) {
                openrider_reject('Invalid template');
            }
            if ($objects > SITE_TEMPLATE_MAX_OBJECTS) {
                openrider_respond(413, [
                    'error' => 'A template holds at most ' . SITE_TEMPLATE_MAX_OBJECTS . ' objects',
                ]);
            }
            $thumbnail = $_POST['thumbnail'] ?? null;
            if ($thumbnail !== null && (!is_string($thumbnail) || !site_check_thumbnail($thumbnail))) {
                openrider_reject('The thumbnail must be a 500x300 PNG');
            }
            if (!site_take_rate_limit($db, 'template', (string) $user['ID'])) {
                openrider_respond(429, ['error' => 'Too many templates saved, try again later']);
            }

            $public = ($_POST['public'] ?? '') === '1';
            return [
                'ID' => site_insert_template(
                    $db,
                    $user['ID'],
                    $name,
                    $code,
                    $objects,
                    $public,
                    $thumbnail
                ),
            ];
        }

        openrider_reject('Invalid parameter: action');
    });
}

/** Templates page: the templates of the account, then the public ones. */
function site_templates_page(): void
{
    $db = site_db();
    $user = site_user();

    site_render_page(
        'templates',
        'Templates',
        [
            'mine' => $user === null ? [] : site_find_template_list($db, $user['ID']),
            'public' => site_find_template_list($db, null),
        ],
        [],
        ['/assets/js/templates.js']
    );
}

/** Code of a template the account sees, as text, copied to the clipboard by the page. */
function site_template_code(int $templateId): void
{
    $template = site_find_template(site_db(), $templateId, site_user()['ID'] ?? null);
    if ($template === null) {
        site_not_found();
        return;
    }

    header('Content-Type: text/plain; charset=UTF-8');
    echo $template['CODE'];
}

/** Thumbnail of a template the account sees, as a PNG image, cached by the browser. */
function site_template_thumbnail(int $templateId): void
{
    $template = site_find_template(site_db(), $templateId, site_user()['ID'] ?? null);
    $png = $template === null || $template['THUMBNAIL'] === null
        ? false
        : base64_decode($template['THUMBNAIL'], true);
    if ($png === false) {
        site_not_found();
        return;
    }

    // A template is never edited: its thumbnail stays the same
    header('Content-Type: image/png');
    header('Cache-Control: private, max-age=86400');
    echo $png;
}

/**
 * Posted action of an account on one of its templates: making it `public` or `private`, or
 * deleting it (`delete`), then back to the templates page.
 */
function site_template_action(int $templateId, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }

    $db = site_db();
    $done = $action === 'delete'
        ? site_delete_template($db, $templateId, $user['ID'])
        : site_set_template_public($db, $templateId, $user['ID'], $action === 'public');
    if (!$done) {
        site_not_found();
        return;
    }
    site_redirect('/templates/');
}
