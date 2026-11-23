<?php

/**
 * Settings of the accounts, in `LOCAL_USER_SETTINGS`: their preferences by name (see
 * SITE_SETTINGS), and their password.
 */

/**
 * The preferences an account saved, by name; those it never saved are missing.
 *
 * @return array<string, string>
 */
function site_find_settings(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT "NAME", "VALUE" FROM "LOCAL_USER_SETTINGS" WHERE "USERID" = :userId'
    );
    $statement->execute(['userId' => $userId]);

    return $statement->fetchAll(PDO::FETCH_KEY_PAIR);
}

/** Saves a preference of an account, replacing its previous value. */
function site_save_setting(PDO $db, int $userId, string $name, string $value): void
{
    // Deleted then inserted: the same on SQLite and PostgreSQL, without an upsert
    site_transaction($db, function () use ($db, $userId, $name, $value) {
        $params = ['userId' => $userId, 'name' => $name];
        $db->prepare('DELETE FROM "LOCAL_USER_SETTINGS" WHERE "USERID" = :userId AND "NAME" = :name')
            ->execute($params);
        $db->prepare(
            'INSERT INTO "LOCAL_USER_SETTINGS" ("USERID", "NAME", "VALUE", "UPDATED")'
            . ' VALUES (:userId, :name, :value, :updated)'
        )->execute($params + ['value' => $value, 'updated' => time()]);
    });
}

/** Hash of the password of an account, null when it does not exist. */
function site_find_password_hash(PDO $db, int $userId): ?string
{
    $statement = $db->prepare('SELECT "PASSWORDHASH" FROM "LOCAL_USERS" WHERE "ID" = :id');
    $statement->execute(['id' => $userId]);
    $hash = $statement->fetchColumn();

    return is_string($hash) ? $hash : null;
}

/**
 * Raises the version of the sessions of an account, logging out every session but those given
 * the new version (see site_user()), and changes its password with it when given.
 *
 * @return int The new version.
 */
function site_renew_sessions(PDO $db, int $userId, ?string $passwordHash = null): int
{
    $set = '"SESSIONVERSION" = "SESSIONVERSION" + 1';
    $params = ['id' => $userId];
    if ($passwordHash !== null) {
        $set .= ', "PASSWORDHASH" = :hash';
        $params['hash'] = $passwordHash;
    }
    $db->prepare("UPDATE \"LOCAL_USERS\" SET $set WHERE \"ID\" = :id")->execute($params);

    $statement = $db->prepare('SELECT "SESSIONVERSION" FROM "LOCAL_USERS" WHERE "ID" = :id');
    $statement->execute(['id' => $userId]);
    return (int) $statement->fetchColumn();
}
