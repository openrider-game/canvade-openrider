<?php

/**
 * Audit log of the moderation, in `LOCAL_AUDIT`: what the moderators and the admins did, with
 * when and by whom, e.g. the roles given, the suspensions, the content of the others deleted and
 * the runs reviewed. Read by the admins on `/admin/audit/`.
 */

/** Entries of the audit log listed per page. */
const SITE_AUDIT_PER_PAGE = 100;

/**
 * Records an action of a moderator or an admin.
 *
 * @param string $action  What was done, e.g. `role`, `suspend` or `delete`.
 * @param string $target  What it was done to, readable, e.g. `account Bob` or `track #3`.
 * @param string $details More, e.g. the new role or the reason of a suspension.
 */
function site_audit(PDO $db, array $actor, string $action, string $target, string $details = ''): void
{
    $db->prepare(
        'INSERT INTO "LOCAL_AUDIT" ("CREATED", "ACTORID", "ACTORNAME", "ACTION", "TARGET", "DETAILS")'
        . ' VALUES (:created, :actorId, :actorName, :action, :target, :details)'
    )->execute([
        'created' => time(),
        'actorId' => $actor['ID'],
        'actorName' => $actor['NAME'],
        'action' => $action,
        'target' => $target,
        'details' => $details,
    ]);
}

/**
 * A page of the audit log, the newest first.
 *
 * @param int $page Page from 1.
 * @return array{entries: array[], pages: int}
 */
function site_find_audit_page(PDO $db, int $page): array
{
    $count = (int) $db->query('SELECT COUNT(*) FROM "LOCAL_AUDIT"')->fetchColumn();
    $statement = $db->prepare(
        'SELECT * FROM "LOCAL_AUDIT" ORDER BY "ID" DESC LIMIT :limit OFFSET :offset'
    );
    $statement->bindValue('limit', SITE_AUDIT_PER_PAGE, PDO::PARAM_INT);
    $statement->bindValue('offset', (max(1, $page) - 1) * SITE_AUDIT_PER_PAGE, PDO::PARAM_INT);
    $statement->execute();

    return [
        'entries' => $statement->fetchAll(PDO::FETCH_ASSOC),
        'pages' => max(1, (int) ceil($count / SITE_AUDIT_PER_PAGE)),
    ];
}
