<?php

/**
 * What tells the admins that something waits for them: the number of runs to review, in the
 * header of the site (see site_count_reviews()), and a message posted to a chat channel through a
 * webhook, configured by `OPENRIDER_REVIEW_WEBHOOK` (see site_notify_review()).
 *
 * The webhook is a Discord one, or a Slack one (`hooks.slack.com`): a message is posted for each
 * run sent to review and each ghost reported, SITE_REVIEW_NOTICES at most in a while, then a
 * single one telling that more wait, the header counting them all.
 */

/** Seconds to wait for the chat service, after answering the request. */
const SITE_WEBHOOK_TIMEOUT = 3;

/**
 * Runs and reported ghosts waiting for an admin: the ghosts, verifying runs and endurance runs
 * sent to review, and the ghosts reported, each once. Zero when they cannot be counted, e.g.
 * before the tables of the site are created: the header never fails for it.
 */
function site_count_reviews(PDO $db): int
{
    try {
        return (int) $db->query(
            'SELECT (SELECT COUNT(*) FROM "LOCAL_GHOST_REVIEWS")'
            . ' + (SELECT COUNT(*) FROM "LOCAL_UPLOADS" WHERE "REVIEW" IS NOT NULL)'
            . ' + (SELECT COUNT(*) FROM "LOCAL_ENDURANCE_RUNS" WHERE "REVIEW" IS NOT NULL)'
            . ' + (SELECT COUNT(DISTINCT "GHOSTID") FROM "LOCAL_GHOST_REPORTS")'
        )->fetchColumn();
    } catch (PDOException $error) {
        return 0;
    }
}

/** Absolute URL of a page of the site, for the messages posted out of it. */
function site_absolute_url(string $path): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (site_is_https() ? 'https' : 'http') . "://$host$path";
}

/**
 * Tells the admins that something waits for them, on the chat channel of the webhook: the
 * message, then the page to look at. Without webhook, nothing is posted. Past
 * SITE_REVIEW_NOTICES in a while, e.g. a program sending ghosts by the dozen, a single message
 * tells that more wait, then none until the while ends.
 *
 * Posted once the request is answered, when the server allows it (PHP-FPM): the rider never
 * waits for the chat service.
 *
 * @param string $path Page of the site to look at, e.g. `/ghosts/12/`.
 */
function site_notify_review(PDO $db, string $message, string $path): void
{
    $webhook = (string) getenv('OPENRIDER_REVIEW_WEBHOOK');
    if (!preg_match('#^https?://#i', $webhook)) {
        return;
    }

    if (site_take_rate_limit($db, 'review-notice', 'site')) {
        $text = $message . "\n" . site_absolute_url($path);
    } elseif (site_take_rate_limit($db, 'review-notice-overflow', 'site')) {
        $text = 'More runs wait for review: ' . site_absolute_url('/reviews/');
    } else {
        return;
    }

    register_shutdown_function(function () use ($webhook, $text) {
        // The answer sent first, then the message
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        site_post_webhook($webhook, $text);
    });
}

/**
 * Posts a message to a Discord or Slack webhook, logging a failure without raising it: a chat
 * service down never fails a request of the site. The mentions are disabled on Discord, a
 * reason written by a rider holding `@everyone` pinging no one.
 */
function site_post_webhook(string $webhook, string $text): void
{
    $slack = parse_url($webhook, PHP_URL_HOST) === 'hooks.slack.com';
    $payload = $slack
        // Slack reads <, > and & as formatting
        ? ['text' => htmlspecialchars($text, ENT_NOQUOTES, 'UTF-8')]
        : ['content' => mb_substr($text, 0, 2000), 'allowed_mentions' => ['parse' => []]];

    $context = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode($payload),
        'timeout' => SITE_WEBHOOK_TIMEOUT,
        'ignore_errors' => true,
    ]]);
    $response = @file_get_contents($webhook, false, $context);
    // The headers of the answer: http_get_last_response_headers() since PHP 8.4, the predefined
    // $http_response_header being deprecated by PHP 8.5. The variable is read through
    // get_defined_vars() so that PHP 8.5 never sees it in the code, which it warns of on compiling
    $headers = function_exists('http_get_last_response_headers')
        ? http_get_last_response_headers()
        : (get_defined_vars()['http_response_header'] ?? null);
    $status = isset($headers[0])
        && preg_match('#^HTTP/\S+ (\d{3})#', $headers[0], $match) ? (int) $match[1] : 0;
    if ($response === false || $status < 200 || $status >= 300) {
        error_log("Review webhook failed ($status)");
    }
}

/** A ghost sent to review, posted to the admins. */
function site_notify_ghost_review(PDO $db, int $ghostId, string $rider, string $track, int $time, array $reasons): void
{
    site_notify_review(
        $db,
        "Ghost of $rider on $track (" . site_duration($time) . ') waits for review: '
        . implode('; ', $reasons),
        "/ghosts/$ghostId/"
    );
}
