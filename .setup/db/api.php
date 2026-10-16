<?php

/**
 * Helpers shared by the endpoints of the OpenRider backend.
 *
 * Every endpoint is a POST request with url-encoded parameters, answering in JSON. The database
 * is configured with environment variables, see `.setup/README.md`.
 */

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

/** Returns the first row of a statement, answering 404 Not Found when there is none. */
function openrider_fetch_one(PDOStatement $statement, string $notFound): array
{
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if ($row === false) {
        openrider_respond(404, ['error' => $notFound]);
    }

    return $row;
}
