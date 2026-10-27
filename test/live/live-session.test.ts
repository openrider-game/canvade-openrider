import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { LIVE_SEND_INTERVAL, LiveSession } from '../../src/openrider/live/live-session';
import type { Track } from '../../src/openrider/track/track';
import { LiveServer } from '../../server/live/live-server';
import { signToken } from '../../server/live/token';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, PlayerKey, pressKey, releaseKey, runTicks } from '../helpers/track';

const SECRET = 'test-secret';

/** Track 1 of the sample of the backend: a jump, a checkpoint, then the target. */
const TRACK_CODE =
    '-50 1i io 1i p0 a s4 a 12c 1i 3a8 1i#68 -4m 84 -5a aa -50 bs -5f do -4m,1l4 -68 1n0 -71' +
    ' 1pg -6i 1rc -76 1t8 -68,340 1i 340 -1s#C 1i0 18,T 340 18###BMX#0 0';

let server: LiveServer;
let url: string;
let dispatchEvent: ReturnType<typeof vi.fn>;
const sessions: LiveSession[] = [];

beforeEach(async () => {
    ({ dispatchEvent } = stubBrowser());
    server = new LiveServer({
        secret: SECRET,
        loadTrackCode: async () => TRACK_CODE,
        verify: async ({ time }) => ({ valid: time > 100, reason: time > 100 ? '' : 'Too fast' }),
        log: () => {},
    });
    url = `ws://127.0.0.1:${await server.listen(0)}/live/`;
});

afterEach(async () => {
    sessions.splice(0).forEach((session) => session.stop());
    (['up', 'down', 'left', 'right'] as PlayerKey[]).forEach(releaseKey);
    await server.close();
    vi.unstubAllGlobals();
});

function token(rider: string, track = 1): string {
    const exp = Date.now() / 1000 + 60;
    return signToken({ session: 'session-1', track, rider, name: rider, exp }, SECRET);
}

/** Joins the session on a new track, as the racing state does. */
function join(rider: string, track = parseTrack(TRACK_CODE, 1)): Track {
    sessions.push(LiveSession.start(track, url, token(rider)));
    return track;
}

/** Runs physics ticks of the tracks as the play states do, letting the messages go meanwhile. */
async function ride(tracks: Track[], ticks: number): Promise<void> {
    for (let tick = 0; tick < ticks; tick++) {
        for (const track of tracks) {
            runTicks(track, 1);
            track.remoteRunners.forEach((runner) => runner.advance());
            LiveSession.of(track)?.tick();
        }
        if (tick % LIVE_SEND_INTERVAL === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
    }
}

/** Waits for a condition on the messages received, riding the tracks meanwhile. */
async function until(tracks: Track[], condition: () => boolean): Promise<void> {
    for (let i = 0; i < 400 && !condition(); i++) {
        await ride(tracks, LIVE_SEND_INTERVAL);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}

/** State of a runner that its replay must match. */
function stateOf(runner: BikeRunner | undefined) {
    return {
        time: runner?.time,
        points: runner?.instance?.points.map((point) => [point.pos.x, point.pos.y]),
        targets: runner?.targetsReached.size,
    };
}

describe('Live session', () => {
    test('shows each rider the runs of the others, restarts included', async () => {
        const ann = join('ann');
        const bob = join('bob');
        const open = () =>
            [ann, bob].every((track) => LiveSession.of(track)?.state.state === 'open');
        await until([ann, bob], open);

        // Ann rides and restarts while Bob watches, then a rider joins in the middle
        pressKey('up');
        await ride([ann, bob], 120);
        ann.restart();
        await ride([ann, bob], 60);
        const cid = join('cid');
        await ride([ann, bob, cid], 60);
        releaseKey('up');
        await ride([ann, bob, cid], LIVE_SEND_INTERVAL);

        // The replays catch up once Ann stops riding
        const caughtUp = () =>
            [bob, cid].every(
                (track) => track.remoteRunners.get('ann')?.time === ann.playerRunner.time,
            );
        await until([bob, cid], caughtUp);
        // Ann rides on during the waits: the last ticks are compared once caught up again
        await until([bob, cid], caughtUp);
        expect(stateOf(bob.remoteRunners.get('ann'))).toEqual(stateOf(ann.playerRunner));
        expect(stateOf(cid.remoteRunners.get('ann'))).toEqual(stateOf(ann.playerRunner));
        expect(bob.remoteRunners.get('ann')?.desynced).toBe(false);
        expect([...ann.remoteRunners.keys()].sort()).toEqual(['bob', 'cid']);

        // Leaving takes the rider off the tracks of the others
        LiveSession.of(cid)?.stop();
        await until(
            [ann, bob],
            () => !ann.remoteRunners.has('cid') && !bob.remoteRunners.has('cid'),
        );
    });

    test('verifies the runs finishing the track for the results told to the page', async () => {
        const ann = join('ann');
        const live = LiveSession.of(ann)!;
        await until([ann], () => live.state.state === 'open');

        await ride([ann], 150);
        const time = ann.playerRunner.time;
        live.finish(GhostParser.generate(ann.playerRunner), time);
        await until([ann], () => live.state.finish !== null);

        expect(live.state.finish).toEqual({ time });
        expect(live.state.results).toEqual([
            { id: 'ann', name: 'ann', best: time, distance: null, retired: false, riding: true },
        ]);
        expect(dispatchEvent).toHaveBeenLastCalledWith(
            expect.objectContaining({ type: 'openrider:live', detail: live.state }),
        );
    });

    test('tells why the server refused to connect, without trying again', async () => {
        const track = parseTrack(TRACK_CODE, 1);
        sessions.push(LiveSession.start(track, url, `${token('ann')}x`));
        const live = LiveSession.of(track)!;
        await until([track], () => live.state.state === 'closed');

        expect(live.state.message).toBe('Invalid or expired token');
    });

    test('connects again after losing the connection', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        try {
            const ann = join('ann');
            const live = LiveSession.of(ann)!;
            for (let i = 0; i < 200 && live.state.state !== 'open'; i++) {
                await vi.advanceTimersByTimeAsync(5);
            }
            expect(live.state.state).toBe('open');

            // Lost: the server closes every connection, then listens again on the same port
            const port = Number(new URL(url).port);
            await server.close();
            for (let i = 0; i < 200 && live.state.state === 'open'; i++) {
                await vi.advanceTimersByTimeAsync(5);
            }
            expect(live.state).toMatchObject({
                state: 'connecting',
                message: 'Connection lost, connecting again...',
            });
            server = new LiveServer({
                secret: SECRET,
                loadTrackCode: async () => TRACK_CODE,
                verify: async () => ({ valid: true, reason: '' }),
                log: () => {},
            });
            await server.listen(port);

            for (let i = 0; i < 400 && live.state.state !== 'open'; i++) {
                await vi.advanceTimersByTimeAsync(5);
            }
            expect(live.state.state).toBe('open');
        } finally {
            vi.useRealTimers();
        }
    });
});
