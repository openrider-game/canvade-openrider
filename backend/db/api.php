<?php

/**
 * Helpers shared by the endpoints of the OpenRider backend.
 *
 * Every endpoint is a POST request with form parameters, answering in JSON, but the download of
 * a track, answering with the bytes of its track file. The database is configured with
 * environment variables, see `backend/README.md`.
 *
 * The track files are the binary format of the game (see `TrackFormat` of the game): `OR`, the
 * version and the flags, then the bike and the start position, then the layers compressed. The
 * tracks saved before it keep the original text formats until migrated (see
 * `migrate-tracks.php`), and every helper reads them too.
 */

/** First bytes of the track files. */
const OPENRIDER_TRACK_MAGIC = 'OR';

/** Flag of the header of the track files: an editor file, keeping the layers of the editor. */
const OPENRIDER_EDITOR_FLAG = 1;

/** Connects to the database configured by the environment, PostgreSQL on localhost by default. */
function openrider_db(): PDO
{
    $dsn = getenv('OPENRIDER_DB_DSN') ?: 'pgsql:host=localhost;port=5432;dbname=postgres';
    $user = getenv('OPENRIDER_DB_USER');
    $password = getenv('OPENRIDER_DB_PASSWORD');

    return new PDO(
        $dsn,
        $user === false ? 'postgres' : $user,
        $password === false ? 'postgres' : $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
    );
}

/** Sends a JSON response with an HTTP status and stops the endpoint. */
function openrider_respond(int $status, $body): void
{
    $json = json_encode($body);

    http_response_code($status);
    header('Content-Type: application/json');
    // The game follows the download progress, even when the server compresses the response
    header('X-File-Size: ' . strlen($json));
    echo $json;
    exit;
}

/** Answers 400 Bad Request with an error message. */
function openrider_reject(string $message): void
{
    openrider_respond(400, ['error' => $message]);
}

/**
 * Reads an integer parameter, rejecting the request when it is missing, invalid or lower than
 * `$min` (ids start at 1).
 */
function openrider_int_param(string $name, int $min = 1): int
{
    $options = ['options' => ['min_range' => $min]];
    $value = filter_var($_POST[$name] ?? null, FILTER_VALIDATE_INT, $options);
    if ($value === false) {
        openrider_reject("Invalid parameter: $name");
    }

    return $value;
}

/**
 * Reads a string parameter, rejecting the request when it is missing, or empty when required.
 */
function openrider_string_param(string $name, bool $required = true): string
{
    $value = $_POST[$name] ?? null;
    if (!is_string($value) || ($required && trim($value) === '')) {
        openrider_reject("Invalid parameter: $name");
    }

    return $value;
}

/**
 * Runs an endpoint: only POST requests are accepted, and the errors are logged and answered
 * with a 500 status, without their details.
 *
 * @param callable $endpoint Receives the database connection and returns the response body.
 */
function openrider_handle(callable $endpoint): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        openrider_respond(405, ['error' => 'Method not allowed']);
    }

    try {
        openrider_respond(200, $endpoint(openrider_db()));
    } catch (Throwable $error) {
        error_log('OpenRider backend: ' . $error->getMessage());
        openrider_respond(500, ['error' => 'Server error']);
    }
}

/**
 * Answers with the bytes of a track file, or the text of a track saved in an original format,
 * and stops the endpoint.
 */
function openrider_respond_code(string $code): void
{
    http_response_code(200);
    header('Content-Type: application/octet-stream');
    // The game follows the download progress, even when the server compresses the response
    header('X-File-Size: ' . strlen($code));
    echo $code;
    exit;
}

/**
 * Reads a track parameter: the bytes of a track file, sent by the game as a file of a multipart
 * form, or a text, a track of an original format or the base 64 text of a track file. Rejects
 * the request when it is missing or empty, and answers 413 when PHP refused a file too large
 * (`upload_max_filesize`).
 */
function openrider_code_param(string $name): string
{
    $file = $_FILES[$name] ?? null;
    if (is_array($file) && is_int($file['error'] ?? null)) {
        if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            openrider_respond(413, ['error' => 'The track is larger than the server accepts']);
        }
        $code = $file['error'] === UPLOAD_ERR_OK && is_uploaded_file($file['tmp_name'])
            ? file_get_contents($file['tmp_name'])
            : false;
        if (!is_string($code) || $code === '') {
            openrider_reject("Invalid parameter: $name");
        }
        return $code;
    }

    $code = openrider_string_param($name);
    // The base 64 text of a track file, as the game sent them for a while
    $bytes = strncmp($code, 'T1I', 3) === 0 ? base64_decode($code, true) : false;
    return is_string($bytes) && openrider_is_track_file($bytes) ? $bytes : $code;
}

/** Whether a code is a track file, rather than a track of an original text format. */
function openrider_is_track_file(string $code): bool
{
    return strlen($code) > 3 && strncmp($code, OPENRIDER_TRACK_MAGIC, 2) === 0;
}

/**
 * Header of a track file, read without inflating its layers: whether it is an editor file
 * (`editor`), and the name of its bike (`bike`, empty when missing). Null for a track of an
 * original text format.
 *
 * @param string $code The track file, or only its first bytes: the bike name follows the flags.
 */
function openrider_track_header(string $code): ?array
{
    if (!openrider_is_track_file($code)) {
        return null;
    }

    // The length of the bike name, a varint: 7 bits per byte, the high bit telling whether more
    // bytes follow
    $offset = 4;
    $length = 0;
    for ($shift = 0; $offset < strlen($code) && $shift < 28; $shift += 7) {
        $byte = ord($code[$offset++]);
        $length |= ($byte & 0x7f) << $shift;
        if ($byte < 0x80) {
            break;
        }
    }

    return [
        'editor' => (ord($code[3]) & OPENRIDER_EDITOR_FLAG) !== 0,
        'bike' => (string) substr($code, $offset, $length),
    ];
}

/**
 * Text of a track, to send it in JSON: the base 64 text of a track file, which the game reads as
 * the file, or the text of a track of an original format.
 */
function openrider_code_text(string $code): string
{
    return openrider_is_track_file($code) ? base64_encode($code) : $code;
}

/**
 * A binary column read by PDO as a string: PostgreSQL gives the `BYTEA` columns as streams,
 * SQLite as strings. Null stays null.
 *
 * @param mixed $value
 */
function openrider_bytes($value): ?string
{
    if (is_resource($value)) {
        return (string) stream_get_contents($value);
    }
    return $value === null ? null : (string) $value;
}

/**
 * Runs a statement with named parameters, the binary ones bound as such: PostgreSQL refuses
 * bytes in a text parameter.
 *
 * @param string[] $binary Names of the binary parameters, e.g. a track code.
 */
function openrider_execute(PDOStatement $statement, array $params, array $binary = []): void
{
    foreach ($params as $name => $value) {
        if (in_array($name, $binary, true)) {
            $type = PDO::PARAM_LOB;
        } elseif ($value === null) {
            $type = PDO::PARAM_NULL;
        } elseif (is_int($value)) {
            $type = PDO::PARAM_INT;
        } else {
            $type = PDO::PARAM_STR;
        }
        $statement->bindValue(":$name", $value, $type);
    }
    $statement->execute();
}

/** Returns the first row of a statement, answering 404 Not Found when there is none. */
function openrider_fetch_one(PDOStatement $statement, string $notFound): array
{
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if ($row === false) {
        openrider_respond(404, ['error' => $notFound]);
    }

    return $row;
}
