<?php

/**
 * Administration of the accounts, for the admins (the `manage_users` capability, see site_can()):
 * the roles and the suspensions of the accounts (`/admin/users/`), and the audit log of what the
 * moderators and the admins did (`/admin/audit/`).
 *
 * The accounts named in `OPENRIDER_ADMINS` are admins whatever their stored role: they are
 * neither demoted nor suspended. No admin changes its own role nor suspends itself, so that the
 * site always keeps an admin, and no admin is suspended: an admin is demoted first.
 */

/** Accounts listed per page of `/admin/users/`. */
const SITE_ADMIN_USERS_PER_PAGE = 50;

/** Durations of a suspension, in days, by the value of the form; 0 for good. */
const SITE_SUSPENSION_DAYS = ['1' => 1, '7' => 7, '30' => 30, '0' => 0];

/** Characters of the reason of a suspension, told to the account. */
const SITE_SUSPENSION_REASON_MAX = 200;

/** The account logged in when it administrates the accounts, else answered as not found. */
function site_require_admin(): ?array
{
    $user = site_require_user();
    if ($user === null) {
        return null;
    }
    if (!site_can($user, 'manage_users')) {
        site_not_found();
        return null;
    }
    return $user;
}

/** The accounts, searched by name, with their role and their suspension. */
function site_admin_users_page(): void
{
    if (site_require_admin() === null) {
        return;
    }
    $search = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    $page = max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT));

    $db = site_db();
    $count = site_count_users($db, $search);
    $pages = max(1, (int) ceil($count / SITE_ADMIN_USERS_PER_PAGE));
    $page = min($page, $pages);

    site_render_page('admin-users', 'Accounts', [
        'search' => $search,
        'count' => $count,
        'page' => $page,
        'pages' => $pages,
        'users' => site_find_users(
            $db,
            $search,
            ($page - 1) * SITE_ADMIN_USERS_PER_PAGE,
            SITE_ADMIN_USERS_PER_PAGE
        ),
    ], ['users.css']);
}

/**
 * Why an admin cannot act on an account, null when it can: its own account, an account named in
 * `OPENRIDER_ADMINS`, or the suspension of an admin.
 */
function site_admin_refusal(array $admin, array $target, string $action): ?string
{
    if ((int) $target['ID'] === $admin['ID']) {
        return 'An admin does not change its own role, nor suspends itself.';
    }
    if (site_is_listed_admin($target)) {
        return 'The accounts named in OPENRIDER_ADMINS stay admins.';
    }
    if ($action === 'suspend' && site_role($target) === 'admin') {
        return 'An admin is not suspended: demote it first.';
    }
    return null;
}

/**
 * Posted action of an admin on an account: its `role` (`role` posted), its suspension (`suspend`,
 * with `days` and `reason`) or the end of it (`unsuspend`); recorded in the audit log, then back
 * to the accounts.
 */
function site_admin_user_action(int $userId, string $action): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $admin = site_require_admin();
    if ($admin === null) {
        return;
    }
    $db = site_db();
    $target = site_find_user($db, $userId);
    if ($target === null) {
        site_not_found();
        return;
    }
    $refusal = site_admin_refusal($admin, $target, $action);
    if ($refusal !== null) {
        http_response_code(403);
        site_render_message('Not allowed', $refusal);
        return;
    }

    $name = 'account ' . $target['NAME'];
    if ($action === 'role') {
        $role = $_POST['role'] ?? '';
        if (!in_array($role, SITE_ROLES, true)) {
            site_render_message('Invalid role', 'The role is one of: ' . implode(', ', SITE_ROLES) . '.');
            return;
        }
        $previous = site_role($target);
        site_set_user_role($db, $userId, $role);
        site_audit($db, $admin, 'role', $name, "$previous to $role");
    } elseif ($action === 'suspend') {
        $days = SITE_SUSPENSION_DAYS[$_POST['days'] ?? ''] ?? null;
        $reason = site_form_text('reason');
        if ($days === null || !preg_match('/^.{0,' . SITE_SUSPENSION_REASON_MAX . '}$/su', $reason)) {
            site_render_message(
                'Invalid suspension',
                'Pick a duration, and a reason of at most ' . SITE_SUSPENSION_REASON_MAX . ' characters.'
            );
            return;
        }
        $until = $days === 0 ? 0 : time() + $days * 86400;
        site_set_user_suspension($db, $userId, $until, $reason === '' ? null : $reason);
        site_audit(
            $db,
            $admin,
            'suspend',
            $name,
            ($days === 0 ? 'for good' : ($days === 1 ? 'for 1 day' : "for $days days")) . ($reason === '' ? '' : ": $reason")
        );
    } else {
        site_set_user_suspension($db, $userId, null, null);
        site_audit($db, $admin, 'unsuspend', $name);
    }

    $query = is_string($_GET['q'] ?? null) && $_GET['q'] !== '' ? '?q=' . rawurlencode($_GET['q']) : '';
    site_redirect('/admin/users/' . $query);
}

/** The audit log, the newest first. */
function site_admin_audit_page(): void
{
    if (site_require_admin() === null) {
        return;
    }
    $page = max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT));
    $audit = site_find_audit_page(site_db(), $page);

    site_render_page('admin-audit', 'Audit log', [
        'entries' => $audit['entries'],
        'page' => min($page, $audit['pages']),
        'pages' => $audit['pages'],
    ], ['users.css']);
}
