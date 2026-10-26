<?php

/**
 * Live races: riders racing a track at the same time through the session server of the game
 * (`server/live`, see the "Live sessions" part of `backend/README.md`). The site picks the ids of
 * the sessions and gives each rider a token signed with the secret of the server, the game
 * connecting with it.
 */

/** Time a token lets a rider join their session, in seconds: a long evening of racing. */
const SITE_LIVE_TOKEN_TTL = 12 * 60 * 60;

/** Ids of the sessions, as the server takes them. */
const SITE_LIVE_SESSION_PATTERN = '/^[A-Za-z0-9_-]{6,64}$/';

/** Whether the live races are set up: the secret of the session server is known. */
function site_live_enabled(): bool
{
    return (string) getenv('OPENRIDER_LIVE_SECRET') !== '';
}

/**
 * URL of the session server for the game: `OPENRIDER_LIVE_URL`, else `/live/` of the site, where
 * Apache forwards it.
 */
function site_live_url(): string
{
    $url = (string) getenv('OPENRIDER_LIVE_URL');
    if ($url !== '') {
        return $url;
    }

    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (site_is_https() ? 'wss' : 'ws') . '://' . $host . '/live/';
}

/** The session of the page (`?live=`), null without a valid one or without live races. */
function site_live_session(): ?string
{
    $session = $_GET['live'] ?? null;
    $valid = is_string($session) && preg_match(SITE_LIVE_SESSION_PATTERN, $session);
    return site_live_enabled() && $valid ? $session : null;
}

/** A new session id, random: the link to the session is all it takes to join it. */
function site_new_live_session(): string
{
    return site_base64url(random_bytes(12));
}

/**
 * The rider of the page in the live sessions: the account, or a guest kept for the browser
 * session, so that joining again from another tab replaces the first one.
 *
 * @return array{0: string, 1: string} The id of the rider and their name.
 */
function site_live_rider(): array
{
    $user = site_user();
    if ($user !== null) {
        return ['u' . $user['ID'], $user['NAME']];
    }

    $_SESSION['liveGuest'] ??= bin2hex(random_bytes(6));
    $guest = $_SESSION['liveGuest'];
    return ['g' . $guest, 'Guest ' . (hexdec(substr($guest, 0, 4)) % 10000)];
}

/** Token of the rider of the page for a session racing a track, see `server/live/token.ts`. */
function site_live_token(string $session, int $trackId): string
{
    [$rider, $name] = site_live_rider();
    $payload = site_base64url(json_encode([
        'session' => $session,
        'track' => $trackId,
        'rider' => $rider,
        'name' => $name,
        'exp' => time() + SITE_LIVE_TOKEN_TTL,
    ]));
    $signature = hash_hmac('sha256', $payload, (string) getenv('OPENRIDER_LIVE_SECRET'), true);

    return $payload . '.' . site_base64url($signature);
}

function site_base64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
