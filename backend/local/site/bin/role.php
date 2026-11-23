<?php

/**
 * Gives a role to an account of the sample website from the command line, e.g. the first admins
 * besides those named in `OPENRIDER_ADMINS`, in the database configured by the environment as
 * for the site. Recorded in the audit log, by "command line".
 *
 * Usage, from the root of the deployed site:
 *
 *     php backend/local/site/bin/role.php <name> <user|moderator|admin>
 *     php backend/local/site/bin/role.php <name>        # prints the role of the account
 *
 * An account named in `OPENRIDER_ADMINS` stays an admin whatever its stored role (see
 * site_role()).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Loads the functions of the site without answering a request
require_once __DIR__ . '/../app.php';

$name = $argv[1] ?? '';
$role = $argv[2] ?? null;
if ($name === '' || ($role !== null && !in_array($role, SITE_ROLES, true))) {
    fwrite(STDERR, 'Usage: php role.php <name> [' . implode('|', SITE_ROLES) . ']' . PHP_EOL);
    exit(2);
}

$db = site_db();
$user = site_find_user_by_name($db, $name);
if ($user === null) {
    fwrite(STDERR, "No account named $name" . PHP_EOL);
    exit(1);
}

if ($role !== null) {
    $previous = site_role($user);
    site_set_user_role($db, (int) $user['ID'], $role);
    site_audit($db, ['ID' => null, 'NAME' => 'command line'], 'role', 'account ' . $user['NAME'], "$previous to $role");
    $user = site_find_user_by_name($db, $name);
}

$listed = site_is_listed_admin($user) ? ' (named in OPENRIDER_ADMINS, so admin whatever its stored role)' : '';
fwrite(STDOUT, $user['NAME'] . ': ' . site_role($user) . $listed . PHP_EOL);
