<?php

/**
 * Accounts of the sample website: the session of the logged in account, and the protection of
 * the forms against cross-site requests.
 *
 * The session cookie is `HttpOnly` and `SameSite=Lax`, so other sites can neither read it nor
 * send it with their POST requests, and `Secure` over HTTPS; the forms of the site also carry a
 * CSRF token. The failed logins and the new accounts are rate limited.
 *
 * The accounts named in `OPENRIDER_ADMINS`, separated with commas, moderate the site: they can
 * delete any track, ghost or account.
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
        // Null when the account no longer exists, e.g. after deleting the database
        $user = site_find_user(site_db(), $userId);
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
    [$min, $max] = [SITE_PASSWORD_MIN_LENGTH, SITE_PASSWORD_MAX_BYTES];
    if (strlen($password) < $min) {
        $errors['password'] = "Passwords have at least $min characters.";
    } elseif (strlen($password) > $max) {
        $errors['password'] = "Passwords have at most $max bytes.";
    } elseif ($password !== $confirmation) {
        $errors['password'] = 'The passwords do not match.';
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

/** Whether an account moderates the site, being named in `OPENRIDER_ADMINS`. */
function site_is_admin(?array $user): bool
{
    if ($user === null) {
        return false;
    }

    $admins = array_map('trim', explode(',', strtolower((string) getenv('OPENRIDER_ADMINS'))));
    return in_array(strtolower($user['NAME']), $admins, true);
}

/**
 * Whether an account can delete something: its own, or anything for the admins.
 *
 * @param mixed $ownerId Id of the account owning it, null without account.
 */
function site_can_delete(?array $user, $ownerId): bool
{
    return $user !== null
        && (($ownerId !== null && (int) $ownerId === $user['ID']) || site_is_admin($user));
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
