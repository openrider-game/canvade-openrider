<?php

/** Ghosts page: the ghosts of every track, the newest or the most liked first. */

/** Ghosts listed on a page of `/ghosts/`. */
const SITE_GHOSTS_PER_PAGE = 50;

/**
 * The ghosts out of review, SITE_GHOSTS_PER_PAGE a page, in two tabs: the newest first, and
 * with `?sort=liked` the most liked first; `page` gives the page, from 1.
 */
function site_ghosts_page(): void
{
    $mostLiked = ($_GET['sort'] ?? '') === 'liked';
    $page = max(1, (int) filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT));

    $db = site_db();
    $count = site_count_ghost_list($db);
    $pages = max(1, (int) ceil($count / SITE_GHOSTS_PER_PAGE));
    $page = min($page, $pages);
    $ghosts = site_find_ghost_list(
        $db,
        $mostLiked,
        ($page - 1) * SITE_GHOSTS_PER_PAGE,
        SITE_GHOSTS_PER_PAGE
    );
    $viewer = site_user();

    site_render_page('ghosts', 'Ghosts', [
        'mostLiked' => $mostLiked,
        'count' => $count,
        'page' => $page,
        'pages' => $pages,
        'ghosts' => $ghosts,
        // What the account thumbed up, its buttons pressed
        'thumbed' => $viewer === null ? [] : site_find_thumbed(
            $db,
            'ghost',
            $viewer['ID'],
            array_map('intval', array_column($ghosts, 'ID'))
        ),
    ], [], ['/assets/js/thumbs.js']);
}
