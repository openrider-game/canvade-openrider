import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token of a rider for a live session, given by the site and checked by the session server, both
 * knowing the secret of the server (`OPENRIDER_LIVE_SECRET`, see the "Live sessions" part of
 * `backend/README.md`).
 *
 * Written `<payload>.<signature>`: the payload is the JSON of the token in base64url, the
 * signature its HMAC-SHA256 with the secret, in base64url too.
 */
export interface LiveToken {
    /** Id of the session, chosen by the site. */
    session: string;
    /**
     * Track of the session: a published track by id, or an endurance track, a seed on a version
     * of its generator.
     */
    track: LiveTrack;
    /** Id of the rider: the account (`u<id>`), or a guest (`g<random>`). */
    rider: string;
    /** Name shown to the other riders. */
    name: string;
    /** Expiry, in seconds since the epoch. */
    exp: number;
}

/** Track of a live session, see {@link LiveToken.track}. */
export type LiveTrack = number | { seed: number; version: number };

/** Key of a track, the same for the tokens of a session. */
export function trackKey(track: LiveTrack): string {
    return typeof track === 'number'
        ? `track:${track}`
        : `endurance:${track.seed}:${track.version}`;
}

function isLiveTrack(value: unknown): value is LiveTrack {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 1;
    }
    const { seed, version } = (value ?? {}) as Record<string, unknown>;
    return (
        Number.isInteger(seed) &&
        (seed as number) >= 0 &&
        (seed as number) < 2 ** 32 &&
        Number.isInteger(version) &&
        (version as number) >= 1
    );
}

const SESSION_ID = /^[A-Za-z0-9_-]{6,64}$/;
const RIDER_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_NAME_LENGTH = 40;

function signature(payload: string, secret: string): Buffer {
    return createHmac('sha256', secret).update(payload).digest();
}

/** Signs a token, as the site does. */
export function signToken(token: LiveToken, secret: string): string {
    const payload = Buffer.from(JSON.stringify(token)).toString('base64url');
    return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

/**
 * Reads a token, null when it is not signed with the secret, malformed or expired.
 *
 * @param now - Current time, in seconds since the epoch.
 */
export function readToken(token: string, secret: string, now: number): LiveToken | null {
    const [payload, signed, ...rest] = token.split('.');
    if (!payload || !signed || rest.length) {
        return null;
    }
    const expected = signature(payload, secret);
    const given = Buffer.from(signed, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null;
    }

    let value: Partial<LiveToken> | null;
    try {
        value = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
        ) as Partial<LiveToken>;
    } catch {
        return null;
    }
    const { session, track, rider, name, exp } = value ?? {};
    if (
        typeof session !== 'string' ||
        !SESSION_ID.test(session) ||
        !isLiveTrack(track) ||
        typeof rider !== 'string' ||
        !RIDER_ID.test(rider) ||
        typeof name !== 'string' ||
        name.trim() === '' ||
        name.length > MAX_NAME_LENGTH ||
        typeof exp !== 'number' ||
        exp <= now
    ) {
        return null;
    }
    const liveTrack: LiveTrack =
        typeof track === 'number' ? track : { seed: track.seed, version: track.version };
    return { session, track: liveTrack, rider, name, exp };
}
