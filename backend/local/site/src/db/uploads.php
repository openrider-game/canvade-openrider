<?php

/**
 * Queries of the uploads of the editor pages, in `LOCAL_UPLOADS`: the drafts, and the track codes
 * waiting for verification until they are published.
 */

/**
 * Keeps a track uploaded by an editor page, out of the backend.
 *
 * @param string|null $thumbnail Base64 PNG, without the data URL prefix.
 * @param string $collaborators Other accounts that edited the track, see site_live_credits().
 * @return int Id of the upload.
 */
function site_insert_upload(
    PDO $db,
    int $userId,
    string $code,
    ?string $thumbnail,
    string $collaborators = ''
): int {
    $statement = $db->prepare(
        'INSERT INTO "LOCAL_UPLOADS" ("USERID", "CODE", "THUMBNAIL", "COLLABORATORS")'
        . ' VALUES (:userId, :code, :thumbnail, :collaborators) RETURNING "ID"'
    );
    openrider_execute($statement, [
        'userId' => $userId,
        'code' => $code,
        'thumbnail' => $thumbnail,
        'collaborators' => $collaborators,
    ], ['code']);

    return (int) $statement->fetchColumn();
}

/**
 * An upload of an account, or null when it does not exist, was published, or belongs to another
 * account.
 */
function site_find_upload(PDO $db, int $uploadId, int $userId): ?array
{
    $upload = site_find_any_upload($db, $uploadId);
    return $upload !== null && (int) $upload['USERID'] === $userId ? $upload : null;
}

/**
 * An upload whatever its account, or null: with its account (`USERID`, `AUTHOR`), and for a
 * track code waiting for verification its verifier (`VERIFIERID`, `VERIFIER`), verifying run
 * (`VERIFICATIONGHOST`, `VERIFICATIONTIME`) and why that run waits for an admin (`REVIEW`).
 */
function site_find_any_upload(PDO $db, int $uploadId): ?array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."CODE", up."THUMBNAIL", up."TITLE", up."DESCRIPTION", up."USERID",'
        . ' up."COLLABORATORS",'
        . ' u."NAME" AS "AUTHOR", up."VERIFIERID", v."NAME" AS "VERIFIER",'
        . ' up."VERIFICATIONGHOST", up."VERIFICATIONTIME", up."REVIEW"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = up."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."ID" = :id'
    );
    $statement->execute(['id' => $uploadId]);
    $upload = $statement->fetch(PDO::FETCH_ASSOC);

    return $upload ? ['CODE' => openrider_bytes($upload['CODE'])] + $upload : null;
}

/**
 * Uploads selected with the head of their code (`CODEHEAD`, see site_code_head()), keeping the
 * editor files or the track codes, without their heads.
 */
function site_filter_uploads(array $uploads, bool $editorFiles): array
{
    $kept = array_filter(
        $uploads,
        fn (array $upload) => site_is_editor_file((string) openrider_bytes($upload['CODEHEAD']))
            === $editorFiles
    );
    return array_values(array_map(function (array $upload) {
        unset($upload['CODEHEAD']);
        return $upload;
    }, $kept));
}

/**
 * The drafts of an account: its editor files saved with a title, newest first.
 *
 * @return array[]
 */
function site_find_drafts(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."THUMBNAIL", up."TITLE", up."DESCRIPTION", '
        . site_code_head('up."CODE"') . ' AS "CODEHEAD" FROM "LOCAL_UPLOADS" up'
        . ' WHERE up."TITLE" IS NOT NULL AND up."USERID" = :userId'
        . ' ORDER BY up."ID" DESC'
    );
    $statement->execute(['userId' => $userId]);

    return site_filter_uploads($statement->fetchAll(PDO::FETCH_ASSOC), true);
}

/**
 * The track codes waiting for verification that an account made or verifies, newest first, with
 * their account (`AUTHOR`), verifier (`VERIFIERID`, `VERIFIER`), verifying time
 * (`VERIFICATIONTIME`, null before) and review (`REVIEW`).
 *
 * @return array[]
 */
function site_find_pending_tracks(PDO $db, int $userId): array
{
    $statement = $db->prepare(
        'SELECT up."ID", up."THUMBNAIL", up."TITLE", up."USERID", u."NAME" AS "AUTHOR",'
        . ' up."VERIFIERID", v."NAME" AS "VERIFIER", up."VERIFICATIONTIME", up."REVIEW", '
        . site_code_head('up."CODE"') . ' AS "CODEHEAD"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" u ON u."ID" = up."USERID"'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."TITLE" IS NOT NULL'
        . ' AND (up."USERID" = :userId OR up."VERIFIERID" = :verifierId)'
        . ' ORDER BY up."ID" DESC'
    );
    $statement->execute(['userId' => $userId, 'verifierId' => $userId]);

    return site_filter_uploads($statement->fetchAll(PDO::FETCH_ASSOC), false);
}

/**
 * Sends an uploaded track code to verification, with its title, description and verifier.
 */
function site_submit_for_verification(
    PDO $db,
    int $uploadId,
    string $title,
    string $description,
    int $verifierId
): void {
    $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "TITLE" = :title, "DESCRIPTION" = :description,'
        . ' "VERIFIERID" = :verifierId WHERE "ID" = :id'
    )->execute([
        'id' => $uploadId,
        'title' => $title,
        'description' => $description,
        'verifierId' => $verifierId,
    ]);
}

/** Gives the verification of a track waiting for it to another account. */
function site_set_verifier(PDO $db, int $uploadId, int $verifierId): void
{
    $db->prepare('UPDATE "LOCAL_UPLOADS" SET "VERIFIERID" = :verifierId WHERE "ID" = :id')
        ->execute(['id' => $uploadId, 'verifierId' => $verifierId]);
}

/**
 * Saves the verifying run of a track, or drops it with null values.
 *
 * @param string|null $review Why the run waits for an admin, null when it does not.
 */
function site_set_verification(
    PDO $db,
    int $uploadId,
    ?string $ghostString,
    ?int $time,
    ?string $review
): void {
    $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "VERIFICATIONGHOST" = :ghost, "VERIFICATIONTIME" = :time,'
        . ' "REVIEW" = :review WHERE "ID" = :id'
    )->execute(['id' => $uploadId, 'ghost' => $ghostString, 'time' => $time, 'review' => $review]);
}

/** Approves the verifying run of a track waiting for an admin. */
function site_approve_verification(PDO $db, int $uploadId): void
{
    $db->prepare('UPDATE "LOCAL_UPLOADS" SET "REVIEW" = NULL WHERE "ID" = :id')
        ->execute(['id' => $uploadId]);
}

/**
 * The tracks waiting for an admin: their verifying run looks suspicious.
 *
 * @return array[]
 */
function site_find_verification_reviews(PDO $db): array
{
    return $db->query(
        'SELECT up."ID", up."TITLE", up."VERIFICATIONTIME", up."REVIEW", v."NAME" AS "VERIFIER"'
        . ' FROM "LOCAL_UPLOADS" up'
        . ' LEFT JOIN "LOCAL_USERS" v ON v."ID" = up."VERIFIERID"'
        . ' WHERE up."REVIEW" IS NOT NULL ORDER BY up."ID"'
    )->fetchAll(PDO::FETCH_ASSOC);
}

/** Saves an uploaded editor file as a draft, with its title and description. */
function site_save_draft(PDO $db, int $uploadId, string $title, string $description): void
{
    $statement = $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "TITLE" = :title, "DESCRIPTION" = :description'
        . ' WHERE "ID" = :id'
    );
    $statement->execute(['id' => $uploadId, 'title' => $title, 'description' => $description]);
}

/**
 * Replaces the editor file and the thumbnail of a draft, uploaded again from its editor page.
 *
 * @param string|null $thumbnail Base64 PNG, without the data URL prefix.
 */
function site_update_draft(
    PDO $db,
    int $draftId,
    string $code,
    ?string $thumbnail,
    string $collaborators = ''
): void {
    // The co-authors of the draft stay, joined by those of the new editor file
    $current = $db->prepare('SELECT "COLLABORATORS" FROM "LOCAL_UPLOADS" WHERE "ID" = :id');
    $current->execute(['id' => $draftId]);
    $merged = site_merge_ids((string) $current->fetchColumn(), $collaborators);
    $current->closeCursor();

    $statement = $db->prepare(
        'UPDATE "LOCAL_UPLOADS" SET "CODE" = :code, "THUMBNAIL" = :thumbnail,'
        . ' "COLLABORATORS" = :collaborators WHERE "ID" = :id'
    );
    openrider_execute($statement, [
        'id' => $draftId,
        'code' => $code,
        'thumbnail' => $thumbnail,
        'collaborators' => $merged,
    ], ['code']);
}

/** Ids separated with commas, of both lists, each once, sorted. */
function site_merge_ids(string $first, string $second): string
{
    $ids = array_map('intval', array_filter(explode(',', "$first,$second")));
    $ids = array_values(array_unique($ids));
    sort($ids);
    return implode(',', $ids);
}

/**
 * Publishes a verified track code: adds it to the tracks of the backend, as its trackupload
 * endpoint does, with its title, description, author and verifier, saves the verifying run as
 * the first ghost of the track, and removes the upload.
 *
 * @param array $upload Verified upload, see site_find_any_upload().
 * @return int Id of the published track.
 */
function site_publish_verified(PDO $db, array $upload): int
{
    return site_transaction($db, function () use ($db, $upload) {
        $statement = $db->prepare(
            'INSERT INTO "TRACKS" ("CODE", "THUMBNAIL") VALUES (:code, :thumbnail) RETURNING "ID"'
        );
        openrider_execute(
            $statement,
            ['code' => $upload['CODE'], 'thumbnail' => $upload['THUMBNAIL']],
            ['code']
        );
        $trackId = (int) $statement->fetchColumn();
        // Closes the statement, SQLite refusing to commit while it is still running
        $statement->closeCursor();

        $ghostId = site_insert_ghost_row(
            $db,
            (int) $upload['VERIFIERID'],
            $upload['VERIFICATIONGHOST'],
            $trackId,
            (int) $upload['VERIFICATIONTIME']
        );

        $db->prepare(
            'INSERT INTO "LOCAL_TRACK_DETAILS"'
            . ' ("TRACKID", "TITLE", "DESCRIPTION", "USERID", "VERIFIERID", "VERIFICATIONGHOSTID",'
            . ' "COLLABORATORS")'
            . ' VALUES (:id, :title, :description, :userId, :verifierId, :ghostId, :collaborators)'
        )->execute([
            'id' => $trackId,
            'title' => $upload['TITLE'],
            'description' => $upload['DESCRIPTION'],
            'userId' => $upload['USERID'],
            'verifierId' => $upload['VERIFIERID'],
            'ghostId' => $ghostId,
            'collaborators' => $upload['COLLABORATORS'] ?? '',
        ]);

        $db->prepare('DELETE FROM "LOCAL_UPLOADS" WHERE "ID" = :id')
            ->execute(['id' => $upload['ID']]);

        return $trackId;
    });
}
