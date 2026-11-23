<?php

/**
 * Accounts of the sample website: the session of the logged in account, and the protection of
 * the forms against cross-site requests.
 *
 * The session cookie is `HttpOnly` and `SameSite=Lax`, so other sites can neither read it nor
 * send it with their POST requests, and `Secure` over HTTPS; the forms of the site also carry a
 * CSRF token. The failed logins and the new accounts are rate limited.
 *
 * A session keeps the version of the sessions of its account it logged in with: raising it, e.g.
 * on a password change, logs the other sessions out (see site_user()).
 *
 * The roles of the accounts and their suspensions are below, see site_can().
 */

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/security.php';

/** User names: 3 to 20 letters, digits, `_` or `-`, which also keeps them out of ghost strings. */
const SITE_USER_NAME_PATTERN = '/^[A-Za-z0-9_-]{3,20}$/';

/** Length of the passwords: bcrypt ignores the bytes after the 72nd. */
const SITE_PASSWORD_MIN_LENGTH = 8,
    SITE_PASSWORD_MAX_BYTES = 72;

/** Bcrypt hash of a password nobody types, checked when logging in with an unknown name. */
const SITE_DUMMY_PASSWORD_HASH = '$2y$10$ofb5WbhEsl/1DLUwXwALs.aD6TOieK48hdwTq3I2lR6RX56k/f5K2';

/**
 * Starts the session of the request, before any output.
 *
 * @param bool $readOnly Whether the session is only read, then closed at once: the game sends
 * its requests in parallel, which would wait for each other on the session lock otherwise.
 */
function site_start_session(bool $readOnly = false): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('openrider_session');
    session_set_cookie_params([
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => site_is_https(),
    ]);
    session_start($readOnly ? ['read_and_close' => true] : []);
}

/** The logged in account (`ID` and `NAME`), or null. */
function site_user(): ?array
{
    static $user = null;

    $userId = $_SESSION['userId'] ?? null;
    if (!is_int($userId)) {
        return null;
    }
    if ($user === null || $user['ID'] !== $userId) {
        // Null when the account no longer exists, e.g. after deleting the database, or when the
        // session is of an older version, logged out by a password change since. The sessions
        // from before the versions have none, the first version.
        $user = site_find_user(site_db(), $userId);
        if ($user !== null && (int) $user['SESSIONVERSION'] !== ($_SESSION['sessionVersion'] ?? 0)) {
            $user = null;
        }
        if ($user !== null) {
            $user['ID'] = (int) $user['ID'];
        }
    }

    return $user;
}

/** Logs an account in, with a new session id against session fixation. */
function site_log_in(int $userId): void
{
    session_regenerate_id(true);
    $_SESSION['userId'] = $userId;
    $_SESSION['sessionVersion'] = (int) (site_find_user(site_db(), $userId)['SESSIONVERSION'] ?? 0);
    // A new token too: the one of the visitor may have been seen before
    unset($_SESSION['csrf']);
}

/** Logs the account out, dropping the whole session. */
function site_log_out(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
}

/**
 * Logs an account in by its name and password.
 *
 * An unknown name is checked against a dummy hash all the same, so that the response time
 * does not tell which names exist. The failed attempts are counted per address and per name:
 * past the limits, even the right password is refused for a while.
 *
 * @return string|null Why the account is not logged in, null once logged in.
 */
function site_authenticate(string $name, string $password): ?string
{
    $db = site_db();
    $address = site_client_address();
    $lowerName = strtolower($name);
    if (
        site_rate_limited($db, 'login-address', $address)
        || site_rate_limited($db, 'login-name', $lowerName)
    ) {
        return 'Too many failed attempts, try again in a few minutes.';
    }

    $user = site_find_user_by_name($db, $name);
    $hash = $user['PASSWORDHASH'] ?? SITE_DUMMY_PASSWORD_HASH;
    if (!password_verify($password, $hash) || $user === null) {
        site_record_event($db, 'login-address', $address);
        site_record_event($db, 'login-name', $lowerName);
        // Same message for both, not to tell which names exist
        return 'Wrong user name or password.';
    }

    site_log_in((int) $user['ID']);
    return null;
}

/** Why a new password is refused, null when valid: its length, or its confirmation differing. */
function site_check_new_password(string $password, string $confirmation): ?string
{
    [$min, $max] = [SITE_PASSWORD_MIN_LENGTH, SITE_PASSWORD_MAX_BYTES];
    if (strlen($password) < $min) {
        return "Passwords have at least $min characters.";
    }
    if (strlen($password) > $max) {
        return "Passwords have at most $max bytes.";
    }
    return $password === $confirmation ? null : 'The passwords do not match.';
}

/**
 * Creates an account and logs it in.
 *
 * @return array Error messages of the invalid fields, by field: `name` and `password`, or of the
 * whole `form` past the rate limit; empty when the account is created.
 */
function site_register(string $name, string $password, string $confirmation): array
{
    $errors = [];
    if (!preg_match(SITE_USER_NAME_PATTERN, $name)) {
        $errors['name'] = 'User names have 3 to 20 letters, digits, "_" or "-".';
    }
    $passwordError = site_check_new_password($password, $confirmation);
    if ($passwordError !== null) {
        $errors['password'] = $passwordError;
    }
    if ($errors) {
        return $errors;
    }

    $db = site_db();
    if (!site_take_rate_limit($db, 'register', site_client_address())) {
        return ['form' => 'Too many accounts were created from your address, try again later.'];
    }
    $userId = site_insert_user($db, $name, password_hash($password, PASSWORD_DEFAULT));
    if ($userId === null) {
        return ['name' => 'This user name is taken.'];
    }

    site_log_in($userId);
    return [];
}

/**
 * Whether the request came over HTTPS, also behind a proxy ending the TLS connection: the
 * `X-Forwarded-Proto` header can only make the cookie stricter, never leak it.
 */
function site_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off')
        || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** Roles of the accounts, from the least rights to the most. */
const SITE_ROLES = ['user', 'moderator', 'admin'];

/**
 * What each role can do besides handling its own content:
 *
 * - `moderate`: delete the tracks, ghosts and comments of the others, and review the runs and the
 *   reports (`/reviews/`);
 * - `manage_users`: give the roles, suspend the accounts, delete the accounts of the others, and
 *   read the audit log (`/admin/`).
 */
const SITE_ROLE_CAPABILITIES = [
    'user' => [],
    'moderator' => ['moderate'],
    'admin' => ['moderate', 'manage_users'],
];

/**
 * Whether an account is named in `OPENRIDER_ADMINS`, names separated with commas: an admin
 * whatever its stored role, who can be neither demoted nor suspended. It starts the site, giving
 * the other roles from `/admin/users/`.
 */
function site_is_listed_admin(?array $user): bool
{
    if ($user === null) {
        return false;
    }
    $admins = array_map('trim', explode(',', strtolower((string) getenv('OPENRIDER_ADMINS'))));
    return in_array(strtolower($user['NAME']), $admins, true);
}

/** Role of an account: `admin` for the accounts named in `OPENRIDER_ADMINS`, else its stored role. */
function site_role(?array $user): string
{
    if ($user === null) {
        return 'user';
    }
    if (site_is_listed_admin($user)) {
        return 'admin';
    }
    $role = $user['ROLE'] ?? 'user';
    return in_array($role, SITE_ROLES, true) ? $role : 'user';
}

/**
 * Whether an account can do something, see SITE_ROLE_CAPABILITIES: logged in, not suspended,
 * and of a role with the capability.
 */
function site_can(?array $user, string $capability): bool
{
    return $user !== null
        && !site_is_suspended($user)
        && in_array($capability, SITE_ROLE_CAPABILITIES[site_role($user)], true);
}

/** Whether an account is suspended for now: it reads the site, but neither posts nor uploads. */
function site_is_suspended(?array $user): bool
{
    $until = $user['SUSPENDEDUNTIL'] ?? null;
    return $until !== null && ((int) $until === 0 || (int) $until > time());
}

/** What a suspended account is told: until when, and why. */
function site_suspension_message(array $user): string
{
    $until = (int) $user['SUSPENDEDUNTIL'];
    $message = $until === 0
        ? 'Your account is suspended.'
        : 'Your account is suspended until ' . gmdate('Y-m-d H:i', $until) . ' UTC.';
    $reason = trim((string) ($user['SUSPENSIONREASON'] ?? ''));
    return $reason === '' ? $message : "$message Reason: $reason";
}

/**
 * Whether an account can delete something: its own, or anything for the moderators.
 *
 * @param mixed $ownerId Id of the account owning it, null without account.
 */
function site_can_delete(?array $user, $ownerId): bool
{
    return $user !== null
        && (($ownerId !== null && (int) $ownerId === $user['ID']) || site_can($user, 'moderate'));
}

/** CSRF token of the session, to post with the forms of the site. */
function site_csrf_token(): string
{
    if (!isset($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf'];
}

/** Whether the posted form carries the CSRF token of the session. */
function site_check_csrf(): bool
{
    $token = $_POST['csrf'] ?? null;
    return is_string($token) && isset($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

/**
 * Page to open after logging in: a path of the site given by `next`, the front page otherwise,
 * never another site.
 */
function site_next_page(): string
{
    $next = $_GET['next'] ?? '';
    return is_string($next) && preg_match('#^/(?![/\\\\])#', $next) ? $next : '/';
}

/**
 * Whether an account can delete an account: itself, or, for the admins, any account but another
 * admin (who is demoted first).
 */
function site_can_delete_account(?array $user, array $target): bool
{
    if ($user === null) {
        return false;
    }
    return (int) $target['ID'] === $user['ID']
        || (site_can($user, 'manage_users') && site_role($target) !== 'admin');
}
