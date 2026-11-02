<?php

/**
 * Templates: objects of a track saved by an account from the select tool of the editor, to paste
 * them in the tracks it edits. A template is private, seen by its account only, or public, seen by
 * every account.
 *
 * The code of a template is written as the first three sections of a track code: the solid lines,
 * the scenery lines and the items, relative to their center (see `ObjectClipboard` of the game).
 */

/** Most objects of a template: the most the select tool of the editor holds at once. */
const SITE_TEMPLATE_MAX_OBJECTS = 5000,
    /** Size of the code of a template, in bytes. */
    SITE_TEMPLATE_MAX_BYTES = 500000,
    /** Characters of the name of a template. */
    SITE_TEMPLATE_NAME_MAX = 60,
    /** Templates listed in each list of the page and of the editor. */
    SITE_TEMPLATES_LISTED = 200;

/**
 * Number of objects of a template code, each line of a polyline counted, or null when the code is
 * not one: three sections of base 32 integers, the items starting with their letter.
 */
function site_template_objects(string $code): ?int
{
    $sections = explode('#', trim($code));
    if (count($sections) !== 3) {
        return null;
    }

    $count = 0;
    foreach ([$sections[0], $sections[1]] as $section) {
        foreach (site_template_entries($section) as $polyline) {
            $points = explode(' ', $polyline);
            if (count($points) < 4 || count($points) % 2 !== 0 || !site_base32_integers($points)) {
                return null;
            }
            $count += count($points) / 2 - 1;
        }
    }
    foreach (site_template_entries($sections[2]) as $item) {
        $values = explode(' ', $item);
        $letter = array_shift($values);
        if (!preg_match('/^[A-Z]$/', $letter) || count($values) < 2 || !site_base32_integers($values)) {
            return null;
        }
        $count++;
    }

    return $count;
}

/** Entries of a section of a code, separated with commas. */
function site_template_entries(string $section): array
{
    return array_values(array_filter(array_map('trim', explode(',', $section)), 'strlen'));
}

/** Whether every value is a base 32 integer, as the coordinates of the track codes. */
function site_base32_integers(array $values): bool
{
    foreach ($values as $value) {
        if (!preg_match('/^-?[0-9a-v]+$/', $value)) {
            return false;
        }
    }

    return true;
}

/**
 * Saves a template of an account, returning its id.
 *
 * @param ?string $thumbnail Its thumbnail as base64 PNG data, checked by site_check_thumbnail(), or
 *                           null without one.
 */
function site_insert_template(
    PDO $db,
    int $userId,
    string $name,
    string $code,
    int $objects,
    bool $public,
    ?string $thumbnail
): int {
    $statement = $db->prepare(
        'INSERT INTO "LOCAL_TEMPLATES"'
        . ' ("USERID", "NAME", "CODE", "OBJECTS", "PUBLIC", "CREATED", "THUMBNAIL")'
        . ' VALUES (:userId, :name, :code, :objects, :public, :created, :thumbnail) RETURNING "ID"'
    );
    $statement->execute([
        'userId' => $userId,
        'name' => $name,
        'code' => $code,
        'objects' => $objects,
        'public' => $public ? 1 : 0,
        'created' => time(),
        'thumbnail' => $thumbnail,
    ]);

    return (int) $statement->fetchColumn();
}

/**
 * Templates of an account, private ones included, or the public templates of every account, the
 * newest first, without their code nor thumbnail: `ID`, `NAME`, `OBJECTS`, `PUBLIC`, `CREATED`,
 * `USERID`, `AUTHOR`, the name of its account, and `HASTHUMBNAIL` (1 or 0).
 */
function site_find_template_list(PDO $db, ?int $userId): array
{
    $mine = $userId !== null;
    $statement = $db->prepare(
        'SELECT t."ID", t."NAME", t."OBJECTS", t."PUBLIC", t."CREATED", t."USERID",'
        . ' u."NAME" AS "AUTHOR", t."THUMBNAIL" IS NOT NULL AS "HASTHUMBNAIL"'
        . ' FROM "LOCAL_TEMPLATES" t'
        . ' JOIN "LOCAL_USERS" u ON u."ID" = t."USERID"'
        . ($mine ? ' WHERE t."USERID" = :userId' : ' WHERE t."PUBLIC" = 1')
        . ' ORDER BY t."ID" DESC LIMIT ' . SITE_TEMPLATES_LISTED
    );
    $statement->execute($mine ? ['userId' => $userId] : []);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

/** A template an account sees, its own or a public one, or null. */
function site_find_template(PDO $db, int $templateId, ?int $userId): ?array
{
    $statement = $db->prepare(
        'SELECT * FROM "LOCAL_TEMPLATES" WHERE "ID" = :id'
        . ' AND ("PUBLIC" = 1 OR "USERID" = :userId)'
    );
    $statement->execute(['id' => $templateId, 'userId' => $userId ?? 0]);
    $template = $statement->fetch(PDO::FETCH_ASSOC);

    return $template === false ? null : $template;
}

/** Makes a template of an account public or private, false when it is not its own. */
function site_set_template_public(PDO $db, int $templateId, int $userId, bool $public): bool
{
    $statement = $db->prepare(
        'UPDATE "LOCAL_TEMPLATES" SET "PUBLIC" = :public WHERE "ID" = :id AND "USERID" = :userId'
    );
    $statement->execute(['public' => $public ? 1 : 0, 'id' => $templateId, 'userId' => $userId]);

    return $statement->rowCount() > 0;
}

/** Deletes a template of an account, false when it is not its own. */
function site_delete_template(PDO $db, int $templateId, int $userId): bool
{
    $statement = $db->prepare(
        'DELETE FROM "LOCAL_TEMPLATES" WHERE "ID" = :id AND "USERID" = :userId'
    );
    $statement->execute(['id' => $templateId, 'userId' => $userId]);

    return $statement->rowCount() > 0;
}
