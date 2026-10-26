import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { LIVE_CLOSE_CODES, ServerMessage } from '../../src/openrider/live/protocol';
import type { RunEvent } from '../../src/openrider/live/run-events';
import { LiveLimits, LiveServer } from '../../server/live/live-server';
import { LiveToken, readToken, signToken } from '../../server/live/token';
import { createVerifier, Verdict } from '../../server/live/verifier';
import { GhostVerifier } from '../../src/verify/ghost-verifier';

const SECRET = 'test-secret';
const NOW = 1_800_000_000_000;

/** Track 1 of the sample of the backend, and the ghost of `Rookie` finishing it. */
const TRACK_CODE =
    '-50 1i io 1i p0 a s4 a 12c 1i 3a8 1i#68 -4m 84 -5a aa -50 bs -5f do -4m,1l4 -68 1n0 -71' +
    ' 1pg -6i 1rc -76 1t8 -68,340 1i 340 -1s#C 1i0 18,T 340 18###BMX#0 0';
const GHOST = '0,,99 119,74 97 122 138 148 159,,227,BMX,Rookie';

/** A run: started, the up key pressed, then ridden for a while. */
const RUN: RunEvent[] = [
    { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
    { type: 'toggle', time: 0, control: 'upPressed' },
    { type: 'progress', time: 30 },
];

let server: LiveServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.terminate());
    await server?.close();
    server = null;
});

/** Starts a server on a free port, verifying the runs with the given verdicts. */
async function start(
    options: {
        verify?: () => Promise<Verdict>;
        limits?: Partial<LiveLimits>;
        now?: () => number;
    } = {},
) {
    const verify = vi.fn(options.verify ?? (async () => ({ valid: true, reason: '' })));
    const loadTrackCode = vi.fn(async () => TRACK_CODE);
    server = new LiveServer({
        secret: SECRET,
        verify,
        loadTrackCode,
        limits: { sweepInterval: 60_000, ...options.limits },
        now: options.now ?? (() => NOW),
        log: () => {},
    });
    const port = await server.listen(0);
    return { port, verify, loadTrackCode };
}

function token(rider: string, overrides: Partial<LiveToken> = {}): string {
    return signToken(
        {
            session: 'session-1',
            track: 1,
            rider,
            name: rider.toUpperCase(),
            exp: NOW / 1000 + 60,
            ...overrides,
        },
        SECRET,
    );
}

/** Rider connected to the server, reading its messages in order. */
interface Client {
    socket: WebSocket;
    /**
     * Next message of the type, matching the condition if any, waiting for it: the messages
     * before it are dropped.
     */
    next<T extends ServerMessage['type']>(
        type: T,
        matches?: (message: Extract<ServerMessage, { type: T }>) => boolean,
    ): Promise<Extract<ServerMessage, { type: T }>>;
    /** Close code and reason, once closed. */
    closed: Promise<{ code: number; reason: string }>;
    send(message: unknown): void;
}

function connect(port: number, tokenValue: string): Client {
    const socket = new WebSocket(
        `ws://127.0.0.1:${port}/live/?token=${encodeURIComponent(tokenValue)}`,
    );
    sockets.push(socket);
    const received: ServerMessage[] = [];
    const waiting: Array<() => void> = [];
    socket.on('message', (data) => {
        received.push(JSON.parse(data.toString()) as ServerMessage);
        waiting.splice(0).forEach((wake) => wake());
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
        socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );

    return {
        socket,
        closed,
        async next(type, matches = () => true) {
            for (;;) {
                const index = received.findIndex(
                    (message) => message.type === type && matches(message as never),
                );
                if (index >= 0) {
                    const [message] = received.splice(0, index + 1).slice(-1);
                    return message as never;
                }
                await new Promise<void>((wake) => waiting.push(wake));
            }
        },
        send(message) {
            const json = JSON.stringify(message);
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(json);
            } else {
                socket.once('open', () => socket.send(json));
            }
        },
    };
}

describe('Live tokens', () => {
    const payload: LiveToken = {
        session: 'session-1',
        track: 4,
        rider: 'u1',
        name: 'Ann',
        exp: 100,
    };

    test('are read back when signed with the secret, before they expire', () => {
        expect(readToken(signToken(payload, SECRET), SECRET, 99)).toEqual(payload);
        expect(readToken(signToken(payload, SECRET), SECRET, 100)).toBeNull();
        expect(readToken(signToken(payload, 'other'), SECRET, 99)).toBeNull();
    });

    test('race a published track, or an endurance track, a seed on a version', () => {
        const endurance = { ...payload, track: { seed: 0, version: 1 } };
        expect(readToken(signToken(endurance, SECRET), SECRET, 99)).toEqual(endurance);
        for (const track of [
            { seed: -1, version: 1 },
            { seed: 2 ** 32, version: 1 },
            { seed: 4 },
        ]) {
            const token = signToken({ ...payload, track } as unknown as LiveToken, SECRET);
            expect(readToken(token, SECRET, 99)).toBeNull();
        }
    });

    test('are refused when changed, or with invalid fields', () => {
        const [, signature] = signToken(payload, SECRET).split('.');
        const changed = Buffer.from(JSON.stringify({ ...payload, track: 5 })).toString('base64url');
        expect(readToken(`${changed}.${signature}`, SECRET, 99)).toBeNull();
        expect(readToken('garbage', SECRET, 99)).toBeNull();
        expect(readToken(signToken({ ...payload, session: 'a b' }, SECRET), SECRET, 99)).toBeNull();
        expect(readToken(signToken({ ...payload, name: ' ' }, SECRET), SECRET, 99)).toBeNull();
        expect(readToken(signToken({ ...payload, track: 0 }, SECRET), SECRET, 99)).toBeNull();
    });
});

describe('Live server', () => {
    test('answers its health check', async () => {
        const { port } = await start();
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        expect(await response.text()).toBe('ok');
    });

    test('refuses the riders without a valid token', async () => {
        const { port } = await start();
        const client = connect(port, token('u1', { exp: NOW / 1000 - 1 }));
        expect((await client.closed).code).toBe(LIVE_CLOSE_CODES.INVALID_TOKEN);
    });

    test('relays the runs, sending the whole runs to the riders joining', async () => {
        const { port } = await start();
        const ann = connect(port, token('ann'));
        expect(await ann.next('welcome')).toEqual({
            type: 'welcome',
            you: { id: 'ann', name: 'ANN' },
            riders: [],
            results: [{ id: 'ann', name: 'ANN', best: null, distance: null, riding: true }],
        });
        ann.send({ type: 'run', events: RUN });
        // Received once the server answers the next message
        ann.send({ type: 'resync', rider: 'nobody' });

        const bob = connect(port, token('bob'));
        const welcome = await bob.next('welcome');
        expect(welcome.riders).toEqual([{ id: 'ann', name: 'ANN', events: RUN }]);
        expect(await ann.next('joined')).toEqual({
            type: 'joined',
            rider: { id: 'bob', name: 'BOB' },
        });

        const more: RunEvent[] = [{ type: 'progress', time: 60 }];
        ann.send({ type: 'run', events: more });
        expect(await bob.next('run')).toEqual({ type: 'run', rider: 'ann', events: more });

        // Asked again, e.g. when the replay no longer matches
        bob.send({ type: 'resync', rider: 'ann' });
        expect(await bob.next('run')).toEqual({
            type: 'run',
            rider: 'ann',
            events: [...RUN.slice(0, 2), { type: 'progress', time: 60 }],
            resync: true,
        });

        ann.socket.close();
        expect(await bob.next('left')).toEqual({ type: 'left', rider: 'ann' });
        expect(server?.stats).toEqual({ sessions: 1, riders: 1 });
    });

    test('verifies the runs finishing the track, keeping the best time of each rider', async () => {
        let valid = true;
        const { port, verify, loadTrackCode } = await start({
            verify: async () => ({
                valid,
                reason: valid ? '' : 'The ghost does not reach every target',
            }),
        });
        const ann = connect(port, token('ann'));
        const bob = connect(port, token('bob'));
        await ann.next('welcome');
        await bob.next('welcome');

        ann.send({ type: 'finish', ghostString: GHOST, time: 300 });
        expect(await ann.next('finished')).toEqual({ type: 'finished', time: 300 });
        expect(verify).toHaveBeenCalledWith({
            trackCode: TRACK_CODE,
            ghostString: GHOST,
            time: 300,
        });
        const annTimed = (message: { results: Array<{ best: number | null }> }) =>
            message.results[0].best !== null;
        expect((await bob.next('results', annTimed)).results).toEqual([
            { id: 'ann', name: 'ANN', best: 300, distance: null, riding: true },
            { id: 'bob', name: 'BOB', best: null, distance: null, riding: true },
        ]);

        // A slower run keeps the best time, a faster one beats it
        ann.send({ type: 'finish', ghostString: GHOST, time: 400 });
        expect(await ann.next('finished')).toEqual({ type: 'finished', time: 400 });
        bob.send({ type: 'finish', ghostString: GHOST, time: 250 });
        await bob.next('finished');
        const bobFirst = (message: { results: Array<{ best: number | null }> }) =>
            message.results[0].best === 250;
        expect((await ann.next('results', bobFirst)).results.map((result) => result.best)).toEqual([
            250, 300,
        ]);

        valid = false;
        bob.send({ type: 'finish', ghostString: GHOST, time: 100 });
        expect(await bob.next('refused')).toEqual({
            type: 'refused',
            reason: 'The ghost does not reach every target',
        });
        // Downloaded once for the session
        expect(loadTrackCode).toHaveBeenCalledOnce();

        // The riders who left keep their time in the results
        bob.socket.close();
        const bobLeft = (message: { results: Array<{ riding: boolean }> }) =>
            !message.results[0].riding;
        expect((await ann.next('results', bobLeft)).results).toEqual([
            { id: 'bob', name: 'BOB', best: 250, distance: null, riding: false },
            { id: 'ann', name: 'ANN', best: 300, distance: null, riding: true },
        ]);
    });

    test('verifies the endurance runs on their seed, ranking the furthest first', async () => {
        const verdicts = [
            { valid: true, reason: '', distance: 120.8 },
            { valid: true, reason: '', distance: 95.2 },
            { valid: true, reason: '', distance: 120.1 },
        ];
        const { port, verify, loadTrackCode } = await start({
            verify: async () => verdicts.shift()!,
        });
        const track = { seed: 42, version: 1 };
        const ann = connect(port, token('ann', { track }));
        const bob = connect(port, token('bob', { track }));
        await ann.next('welcome');
        await bob.next('welcome');

        ann.send({ type: 'finish', ghostString: GHOST, time: 900 });
        expect(await ann.next('finished')).toEqual({ type: 'finished', time: 900, distance: 120 });
        expect(verify).toHaveBeenCalledWith({
            seed: 42,
            version: 1,
            ghostString: GHOST,
            time: 900,
        });
        expect(loadTrackCode).not.toHaveBeenCalled();

        // Faster but not as far, then as far in whole meters and faster
        bob.send({ type: 'finish', ghostString: GHOST, time: 500 });
        await bob.next('finished');
        const bobRanked = (message: { results: Array<{ best: number | null }> }) =>
            message.results.every((result) => result.best !== null);
        expect((await ann.next('results', bobRanked)).results).toEqual([
            { id: 'ann', name: 'ANN', best: 900, distance: 120, riding: true },
            { id: 'bob', name: 'BOB', best: 500, distance: 95, riding: true },
        ]);
        bob.send({ type: 'finish', ghostString: GHOST, time: 800 });
        await bob.next('finished');
        const bobFirst = (message: { results: Array<{ id: string }> }) =>
            message.results[0].id === 'bob';
        expect((await ann.next('results', bobFirst)).results[0]).toEqual({
            id: 'bob',
            name: 'BOB',
            best: 800,
            distance: 120,
            riding: true,
        });

        // Another seed is another session
        expect(
            (await connect(port, token('cid', { track: { seed: 43, version: 1 } })).closed).code,
        ).toBe(LIVE_CLOSE_CODES.INVALID_TOKEN);
    });

    test('refuses the runs too long to verify, or when the verification fails', async () => {
        const { port } = await start({
            verify: async () => {
                throw new Error('Ghost verifier failed');
            },
            limits: { finishTicks: 500 },
        });
        const ann = connect(port, token('ann'));
        ann.send({ type: 'finish', ghostString: GHOST, time: 501 });
        expect((await ann.next('refused')).reason).toBe('The run is too long to be verified');
        ann.send({ type: 'finish', ghostString: GHOST, time: 300 });
        expect((await ann.next('refused')).reason).toBe(
            'The run could not be verified, try again later',
        );
    });

    test('limits the riders of a session, the sessions and the tracks of a session', async () => {
        const { port } = await start({ limits: { ridersPerSession: 1, sessions: 1 } });
        const ann = connect(port, token('ann'));
        await ann.next('welcome');

        expect((await connect(port, token('bob')).closed).code).toBe(LIVE_CLOSE_CODES.SESSION_FULL);
        expect((await connect(port, token('bob', { session: 'session-2' })).closed).code).toBe(
            LIVE_CLOSE_CODES.SERVER_FULL,
        );
        expect((await connect(port, token('ann', { track: 2 })).closed).code).toBe(
            LIVE_CLOSE_CODES.INVALID_TOKEN,
        );
    });

    test('replaces the connection of a rider joining again, keeping their time', async () => {
        const { port } = await start({ limits: { ridersPerSession: 1 } });
        const first = connect(port, token('ann'));
        first.send({ type: 'finish', ghostString: GHOST, time: 300 });
        await first.next('finished');

        const second = connect(port, token('ann'));
        expect((await first.closed).code).toBe(LIVE_CLOSE_CODES.REPLACED);
        expect((await second.next('welcome')).results).toEqual([
            { id: 'ann', name: 'ANN', best: 300, distance: null, riding: true },
        ]);
    });

    test('closes the connections sending invalid messages, or too many', async () => {
        const { port } = await start({ limits: { messageBurst: 3, messagesPerSecond: 1 } });
        const ann = connect(port, token('ann'));
        ann.send({ type: 'run', events: [{ type: 'toggle', time: -1, control: 'upPressed' }] });
        expect((await ann.closed).code).toBe(LIVE_CLOSE_CODES.BAD_MESSAGE);

        const bob = connect(port, token('bob'));
        for (let i = 0; i < 5; i++) {
            bob.send({ type: 'run', events: [{ type: 'progress', time: i }] });
        }
        expect(await bob.closed).toEqual({
            code: LIVE_CLOSE_CODES.BAD_MESSAGE,
            reason: 'Too many messages',
        });
    });

    test('forgets the sessions left empty for a while', async () => {
        let now = NOW;
        const { port } = await start({ now: () => now, limits: { emptySessionTtl: 1000 } });
        const ann = connect(port, token('ann'));
        ann.send({ type: 'finish', ghostString: GHOST, time: 300 });
        await ann.next('finished');
        ann.socket.close();
        await ann.closed;
        // Closed on the server once it answers another request
        await fetch(`http://127.0.0.1:${port}/health`);

        now += 1001;
        server?.sweep();
        expect(server?.stats).toEqual({ sessions: 0, riders: 0 });
        const again = connect(port, token('ann', { exp: now / 1000 + 60 }));
        expect((await again.next('welcome')).results).toEqual([
            { id: 'ann', name: 'ANN', best: null, distance: null, riding: true },
        ]);
    });
});

describe('Live verifier', () => {
    test('replays the runs with the ghost verifier of the game', async () => {
        const verify = createVerifier(join(__dirname, '../../dist/verify-ghost.cjs'), 30);
        expect(await verify({ trackCode: TRACK_CODE, ghostString: GHOST, time: 227 })).toEqual({
            valid: true,
            reason: '',
        });
        expect((await verify({ trackCode: TRACK_CODE, ghostString: GHOST, time: 177 })).valid).toBe(
            false,
        );
    });

    test('replays the endurance runs, telling their distance', async () => {
        // Holding the up key from the start until the rider falls, at the tick the replay tells
        const limits = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };
        const probe = GhostVerifier.verifyEndurance(4, 1, '0,,,,,10000,BMX', 10000, limits);
        const fall = Number(/tick (\d+)/.exec(probe.reason)?.[1]);
        const ghostString = `0,,,,,${fall},BMX`;
        const expected = GhostVerifier.verifyEndurance(4, 1, ghostString, fall, limits);
        expect(expected.valid).toBe(true);

        const verify = createVerifier(join(__dirname, '../../dist/verify-ghost.cjs'), 30);
        expect(await verify({ seed: 4, version: 1, ghostString, time: fall })).toEqual({
            valid: true,
            reason: '',
            distance: expected.distance,
        });
    });
});
