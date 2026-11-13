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

/**
 * Page of a ghost: its inputs as a timeline and the durations of its presses (see
 * `public/js/ghost-inputs.js`), the time its rider spent on the track before saving it, the
 * rider's other runs on the track and level, and the record of the track when it was saved, raced against it; with the
 * form reporting it to the admins. A ghost waiting for an admin is only seen by its account and
 * the admins.
 */
function site_ghost_page(int $ghostId): void
{
    $db = site_db();
    $viewer = site_user();
    $ghost = site_find_ghost_details($db, $ghostId);
    $ownerId = $ghost === null || $ghost['USERID'] === null ? null : (int) $ghost['USERID'];
    $own = $viewer !== null && $ownerId === $viewer['ID'];
    if ($ghost === null || ($ghost['REVIEW'] !== null && !$own && !site_is_admin($viewer))) {
        site_not_found();
        return;
    }

    $trackId = (int) $ghost['TRACKID'];
    $record = site_find_previous_record($db, $trackId, $ghostId);
    site_render_page('ghost', 'Ghost of ' . ($ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING'])), [
        'ghost' => $ghost,
        'record' => $record,
        // Raced together, from the page of the track
        'compare' => $record === null ? null
            : "/tracks/$trackId/?ghosts=$ghostId," . (int) $record['ID'],
        'history' => $ownerId === null ? [] : site_find_rider_track_ghosts($db, $ownerId, $trackId),
        'level' => $ownerId === null ? null : site_find_rider_level($db, $ownerId),
        'firstOpened' => $ownerId === null ? null : site_find_track_visit($db, $ownerId, $trackId),
        'viewer' => $viewer,
        'canReport' => $viewer !== null && !$own && $ghost['REVIEW'] === null,
        'reported' => $viewer !== null && site_has_reported_ghost($db, $ghostId, $viewer['ID']),
    ], [], ['/assets/js/ghost-inputs.js']);
}

/**
 * Reports a ghost to the admins, with a reason of at most SITE_REPORT_REASON_MAX characters,
 * posted by the form of its page: not for the ghosts of the account, nor those already waiting
 * for an admin.
 */
function site_report_ghost_action(int $ghostId): void
{
    if (!site_check_posted_form()) {
        return;
    }
    $user = site_require_user();
    if ($user === null) {
        return;
    }

    $db = site_db();
    $ghost = site_find_ghost_details($db, $ghostId);
    if (
        $ghost === null || $ghost['REVIEW'] !== null
        || ($ghost['USERID'] !== null && (int) $ghost['USERID'] === $user['ID'])
    ) {
        site_not_found();
        return;
    }

    $reason = site_form_text('reason');
    // Counts characters, not bytes; invalid UTF-8 does not match either
    if (!preg_match('/^.{1,' . SITE_REPORT_REASON_MAX . '}$/su', $reason)) {
        http_response_code(422);
        site_render_message(
            'Report not sent',
            'Tell the admins in a few words what looks wrong, in at most '
            . SITE_REPORT_REASON_MAX . ' characters.'
        );
        return;
    }
    if (!site_take_rate_limit($db, 'report', (string) $user['ID'])) {
        http_response_code(429);
        site_render_message('Report not sent', 'Too many reports, try again later.');
        return;
    }

    site_report_ghost($db, $ghostId, $user['ID'], $reason);
    $rider = $ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING']);
    site_notify_review(
        $db,
        "{$user['NAME']} reported the ghost of $rider on "
        . site_track_title(['ID' => $ghost['TRACKID']] + $ghost) . ' ('
        . site_duration((int) $ghost['TIME']) . "): $reason",
        "/ghosts/$ghostId/"
    );
    site_redirect("/ghosts/$ghostId/?reported=1");
}
