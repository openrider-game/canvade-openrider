import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MTB } from '../../src/openrider/bike/mtb';
import {
    REMOTE_BUFFER_TICKS,
    REMOTE_MAX_LAG,
    REMOTE_MAX_STEPS,
    RemoteRunner,
} from '../../src/openrider/bike/runner/remote-runner';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import type { RunEvent } from '../../src/openrider/live/run-events';
import { RunReporter } from '../../src/openrider/live/run-reporter';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import {
    parseTrack,
    PlayerKey,
    pressKey,
    releaseKey,
    runTicks,
    seededRandom,
} from '../helpers/track';

/**
 * Track 4 of the sample of the backend (command blocks opening the way over time, a checkpoint,
 * a target), with a launcher and a second checkpoint added on its way.
 */
const TRACK_CODE =
    '-34 1i 1ug 1i 1ug e2 2e4 e2 2e4 1i 404 1i 404 -4m,1es -4m 1es 1i,1ug 1i 2e4 1i,374 -4m 374' +
    ' 1i#1du 1i 1du -5k 1fq -5k 1fq 1i,366 1i 366 -5k 382 -5k 382 1i,1u6 1i 1u6 0,2ee 1i 2ee 0,' +
    '13a k 14i k 148 a,1nk k 1os k 1oi a,2ms k 2o4 k 2nq a#A 7q 16 0 34,A fk 16 1 1es -u 2b,' +
    'A 13u 16 2 1e8 -5a 1fg 1s,A 1ji 16 0 18,A 1o8 16 3 1u6 18 2ee 1s,' +
    'A 2ng 16 4 36g -5a 37o 1s 0 -7q 1i,A 3dc 16 0 1s,X 2a0 16 0,C 2iq 16,C 300 16,' +
    'T 3ps 16###BMX#0 0';

/** Keys pressed by the rides of the tests: turning around would ride the track backwards. */
const KEYS: PlayerKey[] = ['up', 'down', 'left', 'right'];

/** What the rides of the tests went through, see {@link rideAndReplay}. */
interface Coverage {
    /** Checkpoints kept by the restarts. */
    restartCheckpoints: number[];
    crashed: boolean;
    launched: boolean;
    commands: boolean;
}

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    [...KEYS, 'turn' as const].forEach(releaseKey);
    vi.unstubAllGlobals();
});

/** State of a runner that its replay must match exactly. */
function stateOf(runner: BikeRunner) {
    return {
        time: runner.time,
        dead: runner.dead,
        bike: runner.bikeClass.bikeName,
        points: runner.instance?.points.map((point) => [point.pos.x, point.pos.y]) ?? null,
        controls: { ...runner.controls },
        targets: runner.targetsReached.size,
        checkpoints: runner.snapshots.map((snapshot) => snapshot.time),
        commands: [...runner.commandTimes.values()],
        launchers: [...runner.launcherTouches.values()],
    };
}

/** Replays the events on the track until every tick received is run. */
function catchUp(remote: RemoteRunner): void {
    for (let i = 0; i < 10000 && remote.lag > 0; i++) {
        remote.advance();
    }
}

/**
 * Rides the track as a player would, with random inputs, restarts from the checkpoints,
 * cancelled checkpoints and a new bike, the events of the run being received by the other track
 * in random batches, a few ticks late, while it runs its own ticks.
 *
 * After each part of the ride, the whole run is kept as a rider joining then would receive it,
 * with the state of the player it must lead to.
 */
function rideAndReplay(seed: number) {
    const random = seededRandom(seed);
    const networkRandom = seededRandom(seed + 100);
    const sender = parseTrack(TRACK_CODE, 1);
    const receiver = parseTrack(TRACK_CODE, 1);
    const reporter = new RunReporter(sender.playerRunner);
    const remote = new RemoteRunner(receiver, 'Rider');
    receiver.remoteRunners.set('rider', remote);

    // Joined at the start of the run
    const inFlight: Array<{ at: number; events: RunEvent[] }> = [
        { at: 0, events: reporter.resync() },
    ];
    let tick = 0;
    const network = () => {
        if (networkRandom() < 0.3) {
            inFlight.push({
                at: tick + Math.floor(networkRandom() * 10),
                events: reporter.flush(),
            });
        }
        // In order, as over a WebSocket
        while (inFlight.length && inFlight[0].at <= tick) {
            remote.receive(inFlight.shift()!.events);
        }
        remote.advance();
        tick++;
    };
    const player = sender.playerRunner;
    const coverage: Coverage = {
        restartCheckpoints: [],
        crashed: false,
        launched: false,
        commands: false,
    };
    const joins: Array<{ events: RunEvent[]; state: ReturnType<typeof stateOf> }> = [];
    const ride = (ticks: number) => {
        runTicks(sender, ticks, () => {
            // Accelerating most of the time, the other keys now and then
            for (const key of KEYS) {
                const pressed = key === 'up' ? random() < 0.95 : random() < 0.04;
                (pressed ? pressKey : releaseKey)(key);
            }
            network();
        });
        coverage.crashed ||= player.dead;
        coverage.launched ||= player.launcherTouches.size > 0;
        coverage.commands ||= player.commandTimes.size > 0;
        joins.push({ events: reporter.resync(), state: stateOf(player) });
    };
    const restart = () => {
        coverage.restartCheckpoints.push(player.snapshots.length);
        sender.restart();
    };

    ride(300);
    restart();
    ride(40);
    // The player restarting leaves the other rider alone
    const remoteTime = remote.time;
    receiver.restart();
    expect(remote.time).toBe(remoteTime);
    restart();
    ride(30);
    player.popCheckpoint();
    restart();
    ride(120);
    // A new bike, from the start
    player.bikeClass = MTB;
    player.createBike();
    player.reset();
    restart();
    ride(260);

    remote.receive(inFlight.flatMap(({ events }) => events));
    remote.receive(reporter.flush());
    catchUp(remote);
    return { sender, remote, coverage, joins };
}

describe('Remote runner', () => {
    test('rides through checkpoints, restarts from them, crashes, launchers and commands', () => {
        const coverages = [1, 2, 3].map((seed) => rideAndReplay(seed).coverage);

        const restarts = coverages.flatMap((coverage) => coverage.restartCheckpoints);
        expect(Math.max(...restarts)).toBe(2);
        expect(coverages.some((coverage) => coverage.crashed)).toBe(true);
        expect(coverages.every((coverage) => coverage.launched)).toBe(true);
        expect(coverages.every((coverage) => coverage.commands)).toBe(true);
    });

    test.each([1, 2, 3])('replays the run of a rider exactly, run %i', (seed) => {
        const { sender, remote } = rideAndReplay(seed);

        expect(remote.desynced).toBe(false);
        expect(stateOf(remote)).toEqual(stateOf(sender.playerRunner));
    });

    test.each([1, 2, 3])(
        'replays the whole run for a rider joining late, ending in the same state, run %i',
        (seed) => {
            // The attempts restarted from checkpoints are replayed from the start, without restart
            for (const { events, state } of rideAndReplay(seed).joins) {
                const late = new RemoteRunner(parseTrack(TRACK_CODE, 1), 'Late');
                late.receive(events);
                catchUp(late);

                expect(late.desynced).toBe(false);
                expect(stateOf(late)).toEqual(state);
            }
        },
    );

    test('waits for inputs after a stall, then catches up when far behind', () => {
        const remote = new RemoteRunner(parseTrack(TRACK_CODE, 1), 'Rider');
        remote.receive([{ type: 'start', time: 0, checkpoints: 0, bike: 'BMX' }]);
        remote.receive([{ type: 'progress', time: REMOTE_BUFFER_TICKS - 1 }]);
        remote.advance();
        expect(remote.time).toBe(0);

        remote.receive([{ type: 'progress', time: REMOTE_BUFFER_TICKS }]);
        remote.advance();
        expect(remote.time).toBe(1);

        // Far behind: several ticks per physics tick, down to the lag allowed
        remote.receive([{ type: 'progress', time: 1 + REMOTE_MAX_LAG + 300 }]);
        remote.advance();
        expect(remote.time).toBe(1 + REMOTE_MAX_STEPS);
        catchUp(remote);
        expect(remote.lag).toBe(0);
    });

    test('is marked as live, unlike the ghosts', () => {
        const track = parseTrack(TRACK_CODE, 1);
        const remote = new RemoteRunner(track, 'Rider');
        const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');

        expect(remote.label).toBe('Rider (live)');
        expect(remote.ghostName).toBe('Rider');
        expect(ghost.label).toBe('Ghost');
    });

    test('leaves the tools of the player alone when the rider starts over', () => {
        const track = parseTrack(TRACK_CODE, 1);
        const remote = new RemoteRunner(track, 'Rider');
        track.toolManager.active = true;
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            { type: 'progress', time: 10 },
            { type: 'start', time: 0, checkpoints: 0, bike: 'MTB' },
        ]);
        catchUp(remote);
        remote.advance();

        expect(remote.bikeClass).toBe(MTB);
        expect(track.toolManager.active).toBe(true);
    });

    test('tells when an attempt starts from a checkpoint it did not save', () => {
        const remote = new RemoteRunner(parseTrack(TRACK_CODE, 1), 'Rider');
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            { type: 'progress', time: 10 },
            { type: 'start', time: 8, checkpoints: 1, bike: 'BMX' },
        ]);
        catchUp(remote);
        remote.advance();

        expect(remote.desynced).toBe(true);
    });
});

describe('Run reporter', () => {
    test('sends the inputs, the starts and how far the run went', () => {
        const track: Track = parseTrack(TRACK_CODE, 1);
        const reporter = new RunReporter(track.playerRunner);
        pressKey('up');
        runTicks(track, 3);
        track.restart();
        runTicks(track, 2);

        expect(reporter.flush()).toEqual([
            { type: 'toggle', time: 0, control: 'upPressed' },
            { type: 'progress', time: 3 },
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            { type: 'toggle', time: 0, control: 'upPressed' },
            { type: 'progress', time: 2 },
        ]);
        expect(reporter.flush()).toEqual([{ type: 'progress', time: 2 }]);

        reporter.detach();
        runTicks(track, 1);
        expect(track.playerRunner.runListener).toBeNull();
    });
});
