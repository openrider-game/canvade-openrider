/**
 * Session server of the live races, for Node: `node dist/live-server.cjs`, see the "Live sessions"
 * part of `backend/README.md`.
 *
 * Set up by environment variables:
 * - `OPENRIDER_LIVE_SECRET`: secret the site signs the tokens of the riders with, required;
 * - `OPENRIDER_LIVE_PORT` and `OPENRIDER_LIVE_HOST`: where it listens, `127.0.0.1:8090` by
 *   default, behind Apache;
 * - `OPENRIDER_SITE_URL`: URL of the site the codes of the tracks are downloaded from,
 *   `http://localhost:8000/` by default;
 * - `OPENRIDER_VERIFY_TIMEOUT`: time after which the verification of a run gives up, in seconds,
 *   60 by default.
 *
 * `--dev` runs it next to the local site of `backend/local/router.php`, with a fixed secret
 * when `OPENRIDER_LIVE_SECRET` is not set, for the local site to sign its tokens with: never in
 * production.
 */
import { join } from 'node:path';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import { LiveServer } from './live-server';
import { createVerifier } from './verifier';

/** Secret of the local site when `OPENRIDER_LIVE_SECRET` is not set, never in production. */
const DEV_SECRET = 'openrider-local-live-secret';

/**
 * Downloads the track file of a published track, as text for the ghost verifier: its base 64
 * text, or the text of a track saved in an original format.
 */
async function loadTrackCode(siteUrl: string, trackId: number): Promise<string> {
    const response = await fetch(new URL('backend/db/trackdata/', siteUrl), {
        method: 'POST',
        body: new URLSearchParams({ id: String(trackId) }),
    });
    if (!response.ok) {
        throw new Error(`Cannot download track ${trackId} (${response.status})`);
    }
    return TrackFormat.toCodeText(new Uint8Array(await response.arrayBuffer()));
}

async function main(): Promise<void> {
    const dev = process.argv.includes('--dev');
    const secret = process.env.OPENRIDER_LIVE_SECRET || (dev ? DEV_SECRET : '');
    if (!secret) {
        console.error('Set OPENRIDER_LIVE_SECRET, the secret the site signs the tokens with');
        process.exitCode = 1;
        return;
    }

    const siteUrl = process.env.OPENRIDER_SITE_URL || 'http://localhost:8000/';
    const port = Number(process.env.OPENRIDER_LIVE_PORT) || 8090;
    const host = process.env.OPENRIDER_LIVE_HOST || '127.0.0.1';
    const timeout = Number(process.env.OPENRIDER_VERIFY_TIMEOUT) || 60;

    const server = new LiveServer({
        secret,
        loadTrackCode: (trackId) => loadTrackCode(siteUrl, trackId),
        // Built next to this file
        verify: createVerifier(join(__dirname, 'verify-ghost.cjs'), timeout),
    });
    const listening = await server.listen(port, host);
    console.log(
        `OpenRider live sessions on ws://${host}:${listening}/, tracks of ${siteUrl}` +
            (dev ? ' (dev secret)' : ''),
    );

    const stop = () => {
        void server.close().then(() => process.exit(0));
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

void main();
