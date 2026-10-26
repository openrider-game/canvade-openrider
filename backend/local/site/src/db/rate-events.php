<?php

/** Queries of the events counted by the rate limits, see security.php. */

/** Counts the events of an action for a subject since a time (Unix timestamp). */
function site_count_events(PDO $db, string $action, string $subject, int $since): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM "LOCAL_RATE_EVENTS"'
        . ' WHERE "ACTION" = :action AND "SUBJECT" = :subject AND "TIME" > :since'
    );
    $statement->execute(['action' => $action, 'subject' => $subject, 'since' => $since]);

    return (int) $statement->fetchColumn();
}

/** Records an event of an action for a subject, at a time (Unix timestamp). */
function site_insert_event(PDO $db, string $action, string $subject, int $time): void
{
    $db->prepare(
        'INSERT INTO "LOCAL_RATE_EVENTS" ("ACTION", "SUBJECT", "TIME")'
        . ' VALUES (:action, :subject, :time)'
    )->execute(['action' => $action, 'subject' => $subject, 'time' => $time]);
}

/** Drops the events older than a time (Unix timestamp). */
function site_delete_events_before(PDO $db, int $time): void
{
    $db->prepare('DELETE FROM "LOCAL_RATE_EVENTS" WHERE "TIME" < :time')
        ->execute(['time' => $time]);
}
