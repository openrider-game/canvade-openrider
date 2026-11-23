<?php

/**
 * Settings of the account logged in (`/settings/`): its password, its other sessions logged out,
 * its preferences and its deletion.
 *
 * The preferences (SITE_SETTINGS) follow the account from a browser to another: the theme of the
 * site and the keys of the game, which the game and the theme button keep in the storage of the
 * browser. The layout writes those of the account to that storage before the page runs, and
 * `settings-sync.js` sends back what changed there, e.g. a key bound again in the controls panel
 * of the game (`POST /settings/sync/`). Without an account, the storage of the browser alone keeps
 * them, as before.
 */

/** Themes of the site: the one of the system, or picked. */
const SITE_THEMES = ['system', 'light', 'dark'];

/** Preferences of an account, by name: how each is checked, see site_check_setting(). */
const SITE_SETTINGS = ['theme', 'controls'];

/** Largest key bindings saved, in bytes, and number of controls bound. */
const SITE_CONTROLS_MAX_BYTES = 8192,
    SITE_CONTROLS_MAX_BINDINGS = 64;

/** Key bindings of the game without any key changed, see ControlBindings of the game. */
const SITE_DEFAULT_CONTROLS = '{"version":1,"bindings":{}}';

/**
 * The account logged in, its settings for the layout: its id, the preferences saved, else null,
 * and its token.
 */
function site_account_settings(array $user): array
{
    $settings = site_find_settings(openrider_db(), $user['ID']);
    return [
        'user' => $user['ID'],
        'theme' => $settings['theme'] ?? null,
        'controls' => $settings['controls'] ?? null,
        'csrf' => site_csrf_token(),
    ];
}

/**
 * A preference as saved, null when invalid: a theme of SITE_THEMES, or the key bindings of the
 * game as ControlBindings stores them, `{"version":1,"bindings":{"<control>":{"codes":[...],
 * "modifiers":0,"fireOnce":false}}}`, written again from what was checked.
 */
function site_check_setting(string $name, string $value): ?string
{
    if ($name === 'theme') {
        return in_array($value, SITE_THEMES, true) ? $value : null;
    }
    if ($name !== 'controls' || strlen($value) > SITE_CONTROLS_MAX_BYTES) {
        return null;
    }

    $stored = json_decode($value, true);
    $version = $stored['version'] ?? null;
    $bindings = $stored['bindings'] ?? null;
    if (
        !is_int($version) || $version < 1 || $version > 1000
        || !is_array($bindings) || count($bindings) > SITE_CONTROLS_MAX_BINDINGS
    ) {
        return null;
    }
    $checked = [];
    foreach ($bindings as $control => $data) {
        $codes = $data['codes'] ?? null;
        $valid = is_string($control) && preg_match('/^[A-Za-z0-9_.:-]{1,40}$/', $control)
            && is_array($codes) && $codes !== [] && count($codes) <= 4
            && array_reduce($codes, fn ($ok, $code) => $ok && is_string($code)
                && preg_match('/^[A-Za-z0-9]{1,30}$/', $code), true)
            && is_int($data['modifiers'] ?? null) && $data['modifiers'] >= 0 && $data['modifiers'] < 16
            && is_bool($data['fireOnce'] ?? null);
        if (!$valid) {
            return null;
        }
        $checked[$control] = [
            'codes' => array_values($codes),
            'modifiers' => $data['modifiers'],
            'fireOnce' => $data['fireOnce'],
        ];
    }
    // An object even without any binding, as the game writes it
    return json_encode(['version' => $version, 'bindings' => (object) $checked]);
}

/** The settings page, with the errors of the password form when sent wrong. */
function site_settings_page(array $errors = []): void
{
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $settings = site_find_settings(site_db(), $user['ID']);
    $controls = json_decode($settings['controls'] ?? SITE_DEFAULT_CONTROLS, true);

    site_render_page('settings', 'Settings', [
        'user' => $user,
        'theme' => $settings['theme'] ?? 'system',
        'boundControls' => count($controls['bindings'] ?? []),
        'controlsSaved' => isset($settings['controls']),
        'saved' => is_string($_GET['saved'] ?? null) ? $_GET['saved'] : '',
        'errors' => $errors,
    ]);
}

/**
 * Changes the password of the account with the current one, logging its other sessions out. The
 * wrong current passwords count as failed logins, see site_authenticate().
 */
function site_settings_password(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }

    $current = is_string($_POST['current'] ?? null) ? $_POST['current'] : '';
    $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
    $confirmation = is_string($_POST['confirmation'] ?? null) ? $_POST['confirmation'] : '';
    $db = site_db();
    $lowerName = strtolower($user['NAME']);

    $errors = [];
    if (site_rate_limited($db, 'login-name', $lowerName)) {
        $errors['current'] = 'Too many failed attempts, try again in a few minutes.';
    } elseif (!password_verify($current, site_find_password_hash($db, $user['ID']) ?? '')) {
        site_record_event($db, 'login-name', $lowerName);
        $errors['current'] = 'Wrong password.';
    } else {
        $error = site_check_new_password($password, $confirmation);
        if ($error !== null) {
            $errors['password'] = $error;
        }
    }
    if ($errors) {
        http_response_code(422);
        site_settings_page($errors);
        return;
    }

    $version = site_renew_sessions($db, $user['ID'], password_hash($password, PASSWORD_DEFAULT));
    // This session stays logged in, under a new id
    session_regenerate_id(true);
    $_SESSION['sessionVersion'] = $version;
    site_redirect('/settings/?saved=password');
}

/** Logs the other sessions of the account out, e.g. on a computer left logged in. */
function site_settings_sessions(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $_SESSION['sessionVersion'] = site_renew_sessions(site_db(), $user['ID']);
    session_regenerate_id(true);
    site_redirect('/settings/?saved=sessions');
}

/**
 * Saves the preferences of the settings form: the `theme`, and the keys of the game given back
 * their defaults with `controls=reset`.
 */
function site_settings_preferences(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $db = site_db();
    $theme = site_check_setting('theme', (string) ($_POST['theme'] ?? ''));
    if ($theme !== null) {
        site_save_setting($db, $user['ID'], 'theme', $theme);
    }
    if (($_POST['controls'] ?? '') === 'reset') {
        site_save_setting($db, $user['ID'], 'controls', SITE_DEFAULT_CONTROLS);
    }
    site_redirect('/settings/?saved=preferences');
}

/**
 * Saves the preferences changed in the storage of the browser, sent by `settings-sync.js`, also
 * when the page is left: any of SITE_SETTINGS, the invalid ones refused. Answers JSON.
 */
function site_settings_sync(): void
{
    $user = site_user();
    if ($user === null) {
        openrider_respond(401, ['error' => 'Log in to save your settings']);
    }
    if (!site_check_csrf()) {
        openrider_respond(403, ['error' => 'The page has expired']);
    }

    $db = site_db();
    $saved = [];
    foreach (SITE_SETTINGS as $name) {
        if (!is_string($_POST[$name] ?? null)) {
            continue;
        }
        $value = site_check_setting($name, $_POST[$name]);
        if ($value === null) {
            openrider_respond(422, ['error' => "Invalid setting: $name"]);
        }
        site_save_setting($db, $user['ID'], $name, $value);
        $saved[] = $name;
    }
    openrider_respond(200, ['saved' => $saved]);
}

/** Longest e-mail address, as SMTP allows. */
const SITE_EMAIL_MAX = 254;

/**
 * Saves the e-mail address of the account (`email`, empty for none), whether it wants the
 * digests (`digest`) and whether its Gravatar shows next to its posts (`gravatar`).
 */
function site_settings_email(): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }
    $email = site_form_text('email');
    if ($email !== '' && (strlen($email) > SITE_EMAIL_MAX || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        http_response_code(422);
        site_settings_page(['email' => 'This is not an e-mail address.']);
        return;
    }
    site_set_user_email(
        site_db(),
        $user['ID'],
        $email === '' ? null : $email,
        isset($_POST['digest']),
        isset($_POST['gravatar'])
    );
    site_redirect('/settings/?saved=email');
}
