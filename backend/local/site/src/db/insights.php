<?php

/**
 * What the admins and the riders see of a run besides its inputs, to tell a cheated run from a
 * played one (see the "Reviews" part of `backend/README.md`): the time its rider spent on the
 * track before saving it, measured by the server; the rider's other runs and level; the record
 * it beat; and the reports of the riders.
 *
 * The time on the track is measured from the session of the rider (see site_open_run_clock()):
 * never sent by the game, it cannot be made shorter than it was, only longer, by waiting.
 */

/** Pages whose opening the session of a rider keeps, the least recent forgotten past it. */
const SITE_RUN_CLOCKS = 50;

/**
 * Keeps in the session when a page racing a track was first opened, unless already known: a page
 * reloaded keeps its first opening, so that the time on the track is never shorter than it was.
 * To be called while the session is writable, on rendering the page.
 *
 * @param string $page The track raced, e.g. `track:12`, `verify:3` or `endurance:<seed>:<version>`.
 */
function site_open_run_clock(string $page): void
{
    $clocks = $_SESSION['runClocks'] ?? [];
    if (!is_array($clocks)) {
        $clocks = [];
    }
    if (!isset($clocks[$page])) {
        $clocks[$page] = time();
        // The least recent first, as added
        asort($clocks);
        $clocks = array_slice($clocks, -SITE_RUN_CLOCKS, null, true);
    }
    $_SESSION['runClocks'] = $clocks;
}

/**
 * Seconds since the page racing a track was first opened in the session of the rider, see
 * site_open_run_clock(); null when the session never opened it, e.g. a run sent without the page.
 */
function site_run_clock_seconds(string $page): ?int
{
    $opened = $_SESSION['runClocks'][$page] ?? null;
    return is_int($opened) ? max(0, time() - $opened) : null;
}

/** Keeps when an account first opened the page of a track, once. */
function site_record_track_visit(PDO $db, int $userId, int $trackId): void
{
    $known = $db->prepare(
        'SELECT 1 FROM "LOCAL_TRACK_VISITS" WHERE "USERID" = :userId AND "TRACKID" = :trackId'
    );
    $known->execute(['userId' => $userId, 'trackId' => $trackId]);
    $exists = $known->fetchColumn() !== false;
    $known->closeCursor();
    if (!$exists) {
        $db->prepare(
            'INSERT INTO "LOCAL_TRACK_VISITS" ("USERID", "TRACKID", "FIRSTOPENED")'
            . ' VALUES (:userId, :trackId, :time)'
        )->execute(['userId' => $userId, 'trackId' => $trackId, 'time' => time()]);
    }
}

/** When an account first opened the page of a track, as a Unix timestamp, null when unknown. */
function site_find_track_visit(PDO $db, int $userId, int $trackId): ?int
{
    $statement = $db->prepare(
        'SELECT "FIRSTOPENED" FROM "LOCAL_TRACK_VISITS"'
        . ' WHERE "USERID" = :userId AND "TRACKID" = :trackId'
    );
    $statement->execute(['userId' => $userId, 'trackId' => $trackId]);
    $opened = $statement->fetchColumn();

    return $opened === false ? null : (int) $opened;
}

/**
 * A ghost with what its page shows: its track (`TRACKID`, `TITLE`), its account (`USERID`,
 * `RIDER`, null without), when it was saved (`CREATED`) and the time its rider spent on the track
 * before (`TRACKSECONDS`, both null for the ghosts saved before they were kept), and why it waits
 * for an admin (`REVIEW`); null without it.
 */
function site_find_ghost_details(PDO $db, int $ghostId): ?array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TRACKID", g."TIME", g."GHOSTSTRING", d."TITLE", o."USERID",'
        . ' u."NAME" AS "RIDER", o."CREATED", o."TRACKSECONDS", r."REASONS" AS "REVIEW"'
        . ' FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE g."ID" = :id'
    );
    $statement->execute(['id' => $ghostId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * The record of a track when a ghost was saved: the best of the ghosts saved before it, out of
 * review, with its rider (`RIDER`); null when the ghost was the first.
 */
function site_find_previous_record(PDO $db, int $trackId, int $ghostId): ?array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TIME", u."NAME" AS "RIDER" FROM "GHOSTS" g'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' WHERE g."TRACKID" = :trackId AND g."ID" < :id AND ' . SITE_REVIEWED_GHOST
        . ' ORDER BY g."TIME", g."ID" LIMIT 1'
    );
    $statement->execute(['trackId' => $trackId, 'id' => $ghostId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * The ghosts of an account on a track, oldest first: how its time improved. Each with its time,
 * when it was saved (`CREATED`, null for the ghosts saved before it was kept) and why it waits
 * for an admin (`REVIEW`).
 *
 * @return array[]
 */
function site_find_rider_track_ghosts(PDO $db, int $userId, int $trackId): array
{
    $statement = $db->prepare(
        'SELECT g."ID", g."TIME", o."CREATED", r."REASONS" AS "REVIEW" FROM "GHOSTS" g'
        . ' JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_GHOST_REVIEWS" r ON r."GHOSTID" = g."ID"'
        . ' WHERE o."USERID" = :userId AND g."TRACKID" = :trackId ORDER BY g."ID"'
    );
    $statement->execute(['userId' => $userId, 'trackId' => $trackId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * The level of an account: when it was created (`CREATED`, null for the accounts created before
 * it was kept), its ghosts (`GHOSTS`), the tracks it raced (`TRACKS`), and those whose record it
 * holds (`RECORDS`), counting the ghosts out of review only.
 */
function site_find_rider_level(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT u."CREATED",'
        . ' (SELECT COUNT(*) FROM "LOCAL_GHOST_OWNERS" o WHERE o."USERID" = u."ID") AS "GHOSTS",'
        . ' (SELECT COUNT(DISTINCT g."TRACKID") FROM "GHOSTS" g'
        . ' JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID" WHERE o."USERID" = u."ID")'
        . ' AS "TRACKS"'
        . ' FROM "LOCAL_USERS" u WHERE u."ID" = :userId'
    );
    $statement->execute(['userId' => $userId]);
    $level = $statement->fetch(PDO::FETCH_ASSOC) ?: ['CREATED' => null, 'GHOSTS' => 0, 'TRACKS' => 0];
    $statement->closeCursor();

    // The tracks whose best ghost out of review is one of the account, the oldest on ties
    $records = $db->prepare(
        'SELECT COUNT(*) FROM "GHOSTS" g JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' WHERE o."USERID" = :userId AND ' . SITE_REVIEWED_GHOST
        . ' AND NOT EXISTS (SELECT 1 FROM "GHOSTS" f WHERE f."TRACKID" = g."TRACKID"'
        . ' AND f."ID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")'
        . ' AND (f."TIME" < g."TIME" OR (f."TIME" = g."TIME" AND f."ID" < g."ID")))'
    );
    $records->execute(['userId' => $userId]);
    $level['RECORDS'] = (int) $records->fetchColumn();

    return $level;
}

/** Characters of the reason of a report. */
const SITE_REPORT_REASON_MAX = 300;

/**
 * Reports a ghost to the admins, once per account: a second report of the account replaces its
 * reason. A report does not hide the ghost, an admin deciding.
 */
function site_report_ghost(PDO $db, int $ghostId, int $userId, string $reason): void
{
    site_transaction($db, function () use ($db, $ghostId, $userId, $reason) {
        $params = ['ghostId' => $ghostId, 'userId' => $userId];
        $db->prepare(
            'DELETE FROM "LOCAL_GHOST_REPORTS" WHERE "GHOSTID" = :ghostId AND "USERID" = :userId'
        )->execute($params);
        $db->prepare(
            'INSERT INTO "LOCAL_GHOST_REPORTS" ("GHOSTID", "USERID", "REASON", "CREATED")'
            . ' VALUES (:ghostId, :userId, :reason, :created)'
        )->execute($params + ['reason' => $reason, 'created' => time()]);
    });
}

/** Whether an account reported a ghost. */
function site_has_reported_ghost(PDO $db, int $ghostId, int $userId): bool
{
    $statement = $db->prepare(
        'SELECT 1 FROM "LOCAL_GHOST_REPORTS" WHERE "GHOSTID" = :ghostId AND "USERID" = :userId'
    );
    $statement->execute(['ghostId' => $ghostId, 'userId' => $userId]);

    return $statement->fetchColumn() !== false;
}

/**
 * The reported ghosts, the most reported first, each with its track (`TRACKID`, `TITLE`), its
 * rider (`RIDER`), its time, and its reports (`REPORTS`: `REPORTER`, `REASON`, `CREATED`, the
 * newest first).
 *
 * @return array[]
 */
function site_find_ghost_reports(PDO $db): array
{
    $rows = $db->query(
        'SELECT p."GHOSTID", p."REASON", p."CREATED", v."NAME" AS "REPORTER", g."TRACKID",'
        . ' g."TIME", d."TITLE", u."NAME" AS "RIDER"'
        . ' FROM "LOCAL_GHOST_REPORTS" p'
        . ' JOIN "GHOSTS" g ON g."ID" = p."GHOSTID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = p."USERID"'
        . ' LEFT JOIN "LOCAL_TRACK_DETAILS" d ON d."TRACKID" = g."TRACKID"'
        . ' LEFT JOIN "LOCAL_GHOST_OWNERS" o ON o."GHOSTID" = g."ID"'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = o."USERID"'
        . ' ORDER BY p."CREATED" DESC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $ghosts = [];
    foreach ($rows as $row) {
        $id = (int) $row['GHOSTID'];
        $ghosts[$id] ??= [
            'ID' => $id,
            'TRACKID' => $row['TRACKID'],
            'TITLE' => $row['TITLE'],
            'TIME' => $row['TIME'],
            'RIDER' => $row['RIDER'],
            'REPORTS' => [],
        ];
        $ghosts[$id]['REPORTS'][] = [
            'REPORTER' => $row['REPORTER'],
            'REASON' => $row['REASON'],
            'CREATED' => $row['CREATED'],
        ];
    }
    $ghosts = array_values($ghosts);
    usort($ghosts, fn (array $a, array $b) => count($b['REPORTS']) <=> count($a['REPORTS']));

    return $ghosts;
}

/** Drops the reports of a ghost, an admin finding nothing wrong with it. */
function site_dismiss_ghost_reports(PDO $db, int $ghostId): void
{
    $db->prepare('DELETE FROM "LOCAL_GHOST_REPORTS" WHERE "GHOSTID" = :id')
        ->execute(['id' => $ghostId]);
}

/** A duration in seconds, in its largest units: `45 s`, `12 min`, `3 h 20 min`, `5 days`. */
function site_elapsed(int $seconds): string
{
    if ($seconds < 60) {
        return "$seconds s";
    }
    if ($seconds < 3600) {
        return intdiv($seconds, 60) . ' min';
    }
    if ($seconds < 86400) {
        $minutes = intdiv($seconds % 3600, 60);
        return intdiv($seconds, 3600) . ' h' . ($minutes ? " $minutes min" : '');
    }
    $days = intdiv($seconds, 86400);
    return $days . ($days === 1 ? ' day' : ' days');
}
