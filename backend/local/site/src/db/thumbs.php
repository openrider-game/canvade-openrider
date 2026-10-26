<?php

/**
 * Queries of the thumbs up given by the accounts to the tracks and the ghosts, in
 * `LOCAL_THUMBS`: one row per account and track or ghost (`KIND`, `track` or `ghost`, and
 * `SUBJECTID`, its id).
 */

/** Kinds of the subjects of the thumbs, by the first part of their path, e.g. `/tracks/3/`. */
const SITE_THUMB_KINDS = ['tracks' => 'track', 'ghosts' => 'ghost'];

/**
 * Subquery counting the thumbs of the rows of a query, as a column.
 *
 * @param string $kind   Kind of the subjects, `track` or `ghost`.
 * @param string $column Column of the id of the subject in the query, e.g. `t."ID"`.
 */
function site_thumbs_column(string $kind, string $column): string
{
    return "(SELECT COUNT(*) FROM \"LOCAL_THUMBS\" th WHERE th.\"KIND\" = '$kind'"
        . " AND th.\"SUBJECTID\" = $column) AS \"THUMBS\"";
}

/** Number of thumbs of a track or a ghost. */
function site_count_thumbs(PDO $db, string $kind, int $subjectId): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_THUMBS" WHERE "KIND" = :kind AND "SUBJECTID" = :id'
    );
    $statement->execute(['kind' => $kind, 'id' => $subjectId]);

    return (int) $statement->fetchColumn();
}

/**
 * The tracks or ghosts thumbed up by an account among some, by id.
 *
 * @param int[] $subjectIds
 * @return array<int, true> The ids thumbed up, as keys.
 */
function site_find_thumbed(PDO $db, string $kind, int $userId, array $subjectIds): array
{
    if (!$subjectIds) {
        return [];
    }

    $ids = implode(',', array_map('intval', $subjectIds));
    $statement = $db->prepare(
        'SELECT "SUBJECTID" FROM "LOCAL_THUMBS"'
        . " WHERE \"KIND\" = :kind AND \"USERID\" = :userId AND \"SUBJECTID\" IN ($ids)"
    );
    $statement->execute(['kind' => $kind, 'userId' => $userId]);

    return array_fill_keys(array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN)), true);
}

/**
 * Gives a thumb up of an account to a track or a ghost, or takes it back when it gave one.
 *
 * @return bool Whether the account now thumbs it up.
 */
function site_toggle_thumb(PDO $db, string $kind, int $subjectId, int $userId): bool
{
    return site_transaction($db, function () use ($db, $kind, $subjectId, $userId) {
        $params = ['kind' => $kind, 'id' => $subjectId, 'userId' => $userId];
        $deleted = $db->prepare(
            'DELETE FROM "LOCAL_THUMBS"'
            . ' WHERE "KIND" = :kind AND "SUBJECTID" = :id AND "USERID" = :userId'
        );
        $deleted->execute($params);
        if ($deleted->rowCount() > 0) {
            return false;
        }

        $db->prepare(
            'INSERT INTO "LOCAL_THUMBS" ("KIND", "SUBJECTID", "USERID")'
            . ' VALUES (:kind, :id, :userId)'
        )->execute($params);
        return true;
    });
}

/** Deletes the thumbs of a track or a ghost, deleted itself. */
function site_delete_thumbs(PDO $db, string $kind, int $subjectId): void
{
    $db->prepare('DELETE FROM "LOCAL_THUMBS" WHERE "KIND" = :kind AND "SUBJECTID" = :id')
        ->execute(['kind' => $kind, 'id' => $subjectId]);
}
