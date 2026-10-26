<?php

/** Queries of the accounts of the sample website, in `LOCAL_USERS`. */

/** An account by its id, or null when it does not exist. */
function site_find_user(PDO $db, int $userId): ?array
{
    $statement = $db->prepare('SELECT "ID", "NAME" FROM "LOCAL_USERS" WHERE "ID" = :id');
    $statement->execute(['id' => $userId]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * Condition on `LOCAL_USERS u` keeping the names holding a text whatever its case, `:pattern`
 * being the text escaped by site_like_pattern().
 */
const SITE_USER_NAME_SEARCH = 'LOWER(u."NAME") LIKE LOWER(:pattern) ESCAPE \'!\'';

/** LIKE pattern finding a text anywhere, its `%` and `_` (allowed in user names) as they are. */
function site_like_pattern(string $text): string
{
    return '%' . strtr($text, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
}

/**
 * Accounts by name, with the number of tracks they published (`TRACKS`) and of their ghosts not
 * waiting for an admin (`GHOSTS`).
 *
 * @param string $search Text of the names to list, empty for every account.
 * @return array[]
 */
function site_find_users(PDO $db, string $search, int $offset, int $limit): array
{
    $statement = $db->prepare(
        'SELECT u."ID", u."NAME",'
        . ' (SELECT COUNT(*) FROM "LOCAL_TRACK_DETAILS" d WHERE d."USERID" = u."ID") AS "TRACKS",'
        . ' (SELECT COUNT(*) FROM "LOCAL_GHOST_OWNERS" o WHERE o."USERID" = u."ID"'
        . ' AND o."GHOSTID" NOT IN (SELECT "GHOSTID" FROM "LOCAL_GHOST_REVIEWS")) AS "GHOSTS"'
        . ' FROM "LOCAL_USERS" u WHERE ' . SITE_USER_NAME_SEARCH
        . ' ORDER BY LOWER(u."NAME") LIMIT :limit OFFSET :offset'
    );
    $statement->bindValue('pattern', site_like_pattern($search));
    $statement->bindValue('limit', $limit, PDO::PARAM_INT);
    $statement->bindValue('offset', $offset, PDO::PARAM_INT);
    $statement->execute();

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Number of accounts whose name holds a text.
 *
 * @param string $search Text of the names to count, empty for every account.
 */
function site_count_users(PDO $db, string $search): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_USERS" u WHERE ' . SITE_USER_NAME_SEARCH
    );
    $statement->execute(['pattern' => site_like_pattern($search)]);

    return (int) $statement->fetchColumn();
}

/**
 * An account by its name, whatever its case, with its password hash (`PASSWORDHASH`), or null
 * when it does not exist.
 */
function site_find_user_by_name(PDO $db, string $name): ?array
{
    $statement = $db->prepare(
        'SELECT "ID", "NAME", "PASSWORDHASH" FROM "LOCAL_USERS" WHERE LOWER("NAME") = LOWER(:name)'
    );
    $statement->execute(['name' => $name]);

    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * Creates an account. The first one takes over the drafts and uploads made before the accounts,
 * which would be lost otherwise: nobody else can open them.
 *
 * @return int|null Id of the account, null when the name is taken.
 */
function site_insert_user(PDO $db, string $name, string $passwordHash): ?int
{
    $db->beginTransaction();
    try {
        if (site_find_user_by_name($db, $name) !== null) {
            $db->rollBack();
            return null;
        }
        $first = (int) $db->query('SELECT COUNT(*) FROM "LOCAL_USERS"')->fetchColumn() === 0;

        $statement = $db->prepare(
            'INSERT INTO "LOCAL_USERS" ("NAME", "PASSWORDHASH") VALUES (:name, :hash)'
            . ' RETURNING "ID"'
        );
        $statement->execute(['name' => $name, 'hash' => $passwordHash]);
        $userId = (int) $statement->fetchColumn();
        // Closes the statement, SQLite refusing to commit while it is still running
        $statement->closeCursor();

        if ($first) {
            $db->prepare('UPDATE "LOCAL_UPLOADS" SET "USERID" = :id WHERE "USERID" IS NULL')
                ->execute(['id' => $userId]);
        }

        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }

    return $userId;
}
