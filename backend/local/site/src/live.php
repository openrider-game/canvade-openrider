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

/**
 * The session of the page, null without a valid one or without live races.
 *
 * @param string $param Parameter of the page giving it: `live` racing, `collab` editing.
 */
function site_live_session(string $param = 'live'): ?string
{
    $session = $_GET[$param] ?? null;
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

/**
 * Token of the rider of the page for a session racing a track, see `server/live/token.ts`.
 *
 * @param int|array $track Id of a published track, or an endurance track: its `seed` on a
 *   `version` of the generator.
 */
function site_live_token(string $session, $track): string
{
    [$rider, $name] = site_live_rider();
    $payload = site_base64url(json_encode([
        'session' => $session,
        'track' => $track,
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

/**
 * The other accounts that edited a track with the account uploading it, from the credits of the
 * editing session sent by the game: `<payload>.<signature>`, signed by the session server with
 * `OPENRIDER_LIVE_SECRET`, the payload `{ "session", "host", "authors", "exp" }` in base64url.
 * Only the host of the session, the main creator of the track, credits them.
 *
 * @return string Their ids separated with commas, sorted; empty for invalid or expired credits,
 *   or uploaded by another account than the host.
 */
function site_live_credits(string $credits, int $uploaderId): string
{
    $secret = (string) getenv('OPENRIDER_LIVE_SECRET');
    $parts = explode('.', $credits);
    if ($secret === '' || count($parts) !== 2) {
        return '';
    }
    [$payload, $signature] = $parts;
    if (!hash_equals(site_base64url(hash_hmac('sha256', $payload, $secret, true)), $signature)) {
        return '';
    }

    $data = json_decode((string) base64_decode(strtr($payload, '-_', '+/')), true);
    if (!is_array($data) || !is_int($data['exp'] ?? null) || $data['exp'] < time()) {
        return '';
    }
    if (($data['host'] ?? null) !== 'u' . $uploaderId) {
        return '';
    }
    $ids = [];
    foreach ((array) ($data['authors'] ?? []) as $rider) {
        // The accounts only, the editing sessions taking no guest
        if (is_string($rider) && preg_match('/^u([0-9]{1,10})$/', $rider, $match)) {
            $ids[] = (int) $match[1];
        }
    }
    $ids = array_diff($ids, [$uploaderId]);

    return site_merge_ids(implode(',', $ids), '');
}
