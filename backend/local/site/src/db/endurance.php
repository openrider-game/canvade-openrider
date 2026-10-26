<?php

/**
 * Queries of the endurance runs, in `LOCAL_ENDURANCE_RUNS`, ranked on the endurance page.
 *
 * A track is a seed on a version of the generator of the game: the same seed gives another
 * track in another version, with its own runs.
 */

/**
 * Condition on `LOCAL_ENDURANCE_RUNS e` keeping the runs ranked before a distance and a time:
 * further, or as far and faster.
 */
const SITE_ENDURANCE_BEFORE = '(e."DISTANCE" > :distance'
    . ' OR (e."DISTANCE" = :sameDistance AND e."TIME" < :time))';

/**
 * The best ranked endurance runs on a track, best first: further, then faster, then saved
 * first. Each one with its account (`NAME`).
 *
 * @return array[]
 */
function site_find_endurance_runs(PDO $db, int $seed, int $version, int $limit): array
{
    $statement = $db->prepare(
        'SELECT e."ID", e."USERID", e."DISTANCE", e."TIME", u."NAME"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."SEED" = :seed AND e."VERSION" = :version AND e."REVIEW" IS NULL'
        . ' ORDER BY e."DISTANCE" DESC, e."TIME", e."ID" LIMIT ' . $limit
    );
    $statement->execute(['seed' => $seed, 'version' => $version]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Number of ranked endurance runs on a track. */
function site_count_endurance_runs(PDO $db, int $seed, int $version): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_ENDURANCE_RUNS"'
        . ' WHERE "SEED" = :seed AND "VERSION" = :version AND "REVIEW" IS NULL'
    );
    $statement->execute(['seed' => $seed, 'version' => $version]);

    return (int) $statement->fetchColumn();
}

/**
 * The endurance run of an account on a track, with its rank among the ranked runs (`RANK`, null
 * while it waits for an admin), or null without any.
 */
function site_find_endurance_run_of(PDO $db, int $seed, int $version, int $userId): ?array
{
    $statement = $db->prepare(
        'SELECT e."ID", e."USERID", e."DISTANCE", e."TIME", e."REVIEW", u."NAME"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."SEED" = :seed AND e."VERSION" = :version AND e."USERID" = :userId'
    );
    $statement->execute(['seed' => $seed, 'version' => $version, 'userId' => $userId]);
    $run = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$run) {
        return null;
    }

    $run['RANK'] = $run['REVIEW'] === null
        ? site_endurance_rank($db, $seed, $version, (int) $run['DISTANCE'], (int) $run['TIME'])
        : null;
    return $run;
}

/** Rank a distance and a time would have among the ranked runs of a track, from 1. */
function site_endurance_rank(PDO $db, int $seed, int $version, int $distance, int $time): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_ENDURANCE_RUNS" e'
        . ' WHERE e."SEED" = :seed AND e."VERSION" = :version AND e."REVIEW" IS NULL'
        . ' AND ' . SITE_ENDURANCE_BEFORE
    );
    $statement->execute([
        'seed' => $seed,
        'version' => $version,
        'distance' => $distance,
        'sameDistance' => $distance,
        'time' => $time,
    ]);

    return (int) $statement->fetchColumn() + 1;
}

/**
 * Keeps an endurance run as the run of its account on its track, in place of the one before.
 *
 * @param string|null $review Why the run waits for an admin, null when it ranks.
 * @return int Id of the run.
 */
function site_save_endurance_run(
    PDO $db,
    int $userId,
    int $seed,
    int $version,
    string $ghostString,
    int $distance,
    int $time,
    ?string $review
): int {
    return site_transaction($db, function () use (
        $db,
        $userId,
        $seed,
        $version,
        $ghostString,
        $distance,
        $time,
        $review
    ) {
        $params = ['seed' => $seed, 'version' => $version, 'userId' => $userId];
        $db->prepare(
            'DELETE FROM "LOCAL_ENDURANCE_RUNS"'
            . ' WHERE "SEED" = :seed AND "VERSION" = :version AND "USERID" = :userId'
        )->execute($params);
        $statement = $db->prepare(
            'INSERT INTO "LOCAL_ENDURANCE_RUNS"'
            . ' ("SEED", "VERSION", "USERID", "GHOSTSTRING", "DISTANCE", "TIME", "REVIEW")'
            . ' VALUES (:seed, :version, :userId, :ghostString, :distance, :time, :review)'
            . ' RETURNING "ID"'
        );
        $statement->execute($params + [
            'ghostString' => $ghostString,
            'distance' => $distance,
            'time' => $time,
            'review' => $review,
        ]);
        $runId = (int) $statement->fetchColumn();
        $statement->closeCursor();

        return $runId;
    });
}

/**
 * The ghost string of an endurance run on a track: a ranked run, a run of the account, or any
 * run for the admins; null for the others, and for the runs of other tracks.
 */
function site_find_endurance_ghost(
    PDO $db,
    int $runId,
    int $seed,
    int $version,
    ?int $userId,
    bool $admin
): ?string {
    $statement = $db->prepare(
        'SELECT "GHOSTSTRING" FROM "LOCAL_ENDURANCE_RUNS"'
        . ' WHERE "ID" = :id AND "SEED" = :seed AND "VERSION" = :version'
        . ($admin ? '' : ' AND ("REVIEW" IS NULL OR "USERID" = :userId)')
    );
    $params = ['id' => $runId, 'seed' => $seed, 'version' => $version];
    $statement->execute($params + ($admin ? [] : ['userId' => $userId ?? 0]));
    $ghostString = $statement->fetchColumn();

    return $ghostString === false ? null : (string) $ghostString;
}

/**
 * The endurance runs waiting for an admin, oldest first, with their account (`RIDER`).
 *
 * @param int|null $seed    Seed of the track of the runs, null for every track.
 * @param int|null $version Version of the generator of that track, with the seed.
 * @return array[]
 */
function site_find_endurance_reviews(PDO $db, ?int $seed = null, ?int $version = null): array
{
    $onTrack = $seed !== null && $version !== null;
    $statement = $db->prepare(
        'SELECT e."ID", e."SEED", e."VERSION", e."DISTANCE", e."TIME", e."REVIEW",'
        . ' u."NAME" AS "RIDER"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."REVIEW" IS NOT NULL'
        . ($onTrack ? ' AND e."SEED" = :seed AND e."VERSION" = :version' : '')
        . ' ORDER BY e."ID"'
    );
    $statement->execute($onTrack ? ['seed' => $seed, 'version' => $version] : []);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** Approves an endurance run waiting for an admin, ranking it. */
function site_approve_endurance_run(PDO $db, int $runId): void
{
    $db->prepare('UPDATE "LOCAL_ENDURANCE_RUNS" SET "REVIEW" = NULL WHERE "ID" = :id')
        ->execute(['id' => $runId]);
}

/** Deletes an endurance run, e.g. rejected by an admin. */
function site_delete_endurance_run(PDO $db, int $runId): void
{
    $db->prepare('DELETE FROM "LOCAL_ENDURANCE_RUNS" WHERE "ID" = :id')->execute(['id' => $runId]);
}

/**
 * The endurance run of an account on a track, by the name of the account whatever its case, to
 * race it from a shared link: a ranked run, or any run for its account and the admins; null
 * without one.
 */
function site_find_endurance_run_by_name(
    PDO $db,
    int $seed,
    int $version,
    string $name,
    ?int $viewerId,
    bool $admin
): ?array {
    $statement = $db->prepare(
        'SELECT e."ID", e."USERID", e."DISTANCE", e."TIME", e."REVIEW", u."NAME"'
        . ' FROM "LOCAL_ENDURANCE_RUNS" e JOIN "LOCAL_USERS" u ON u."ID" = e."USERID"'
        . ' WHERE e."SEED" = :seed AND e."VERSION" = :version AND LOWER(u."NAME") = LOWER(:name)'
    );
    $statement->execute(['seed' => $seed, 'version' => $version, 'name' => $name]);
    $run = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$run) {
        return null;
    }

    $visible = $run['REVIEW'] === null || $admin || (int) $run['USERID'] === $viewerId;
    return $visible ? $run : null;
}
