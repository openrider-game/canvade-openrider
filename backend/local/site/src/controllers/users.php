<?php

/** Pages of the accounts: their list, searched by name, and the page of each one. */

/** Accounts listed on a page of `/users/`. */
const SITE_USERS_PER_PAGE = 50;

/**
 * The accounts by name, SITE_USERS_PER_PAGE a page, with the number of their tracks and ghosts:
 * the `q` parameter of the URL searches the names holding it, `page` gives the page, from 1.
 */
function site_users_page(): void
{
    $search = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
    $page = max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT));

    $db = site_db();
    $count = site_count_users($db, $search);
    $pages = max(1, (int) ceil($count / SITE_USERS_PER_PAGE));
    $page = min($page, $pages);

    site_render_page('users', 'Users', [
        'search' => $search,
        'count' => $count,
        'page' => $page,
        'pages' => $pages,
        'users' => site_find_users(
            $db,
            $search,
            ($page - 1) * SITE_USERS_PER_PAGE,
            SITE_USERS_PER_PAGE
        ),
    ], ['users.css']);
}

/** The published tracks and the ghosts of an account. */
function site_user_page(string $name): void
{
    $db = site_db();
    $user = site_find_user_by_name($db, $name);
    if ($user === null) {
        site_not_found();
        return;
    }
    $userId = (int) $user['ID'];

    site_render_page('user', $user['NAME'], [
        'userId' => $userId,
        'name' => $user['NAME'],
        'tracks' => site_find_tracks($db, $userId),
        // With the ghosts waiting for an admin for the account itself and the admins
        'ghosts' => site_find_user_ghosts($db, $userId, site_can_delete(site_user(), $userId)),
    ]);
}
