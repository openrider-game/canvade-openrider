import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { RemoteRunner } from '../../src/openrider/bike/runner/remote-runner';
import { CONTROL_NAMES } from '../../src/openrider/bike/runner/runner-controls';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import type { RunEvent } from '../../src/openrider/live/run-events';
import { RunReporter } from '../../src/openrider/live/run-reporter';
import { Track } from '../../src/openrider/track/track';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { PlayerKey, pressKey, releaseKey, seededRandom } from '../helpers/track';

/** Keys pressed by the rides: turning around would ride the track backwards. */
const KEYS: PlayerKey[] = ['up', 'down', 'left', 'right'];
const SEED = 4;

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    [...KEYS, 'turn' as const].forEach(releaseKey);
    vi.unstubAllGlobals();
});

/** A new endurance track of the seed, with its course and the bike of the player. */
function createCourse(): EnduranceCourse {
    const track = new Track(null);
    track.canvas = createCanvasMock().canvas;
    const course = new EnduranceCourse(track, SEED);
    track.playerRunner.createBike();
    track.restart();
    return course;
}

/** Runs a physics tick of an endurance track, as the play and endurance states do. */
function tick(course: EnduranceCourse): void {
    const track = course.track;
    track.playerRunner.fixedUpdate();
    track.ghostRunners.forEach((ghost) => ghost.fixedUpdate());
    track.remoteRunners.forEach((runner) => runner.advance());
    course.step();
}

/** State of a runner and its run on its course, that a replay must match. */
function stateOf(course: EnduranceCourse, runner: BikeRunner | undefined) {
    const rider = runner && course.riderOf(runner);
    return {
        time: runner?.time,
        dead: runner?.dead,
        points: runner?.instance?.points.map((point) => [point.pos.x, point.pos.y]) ?? null,
        distance: rider?.distance,
        over: rider?.over,
        riderTime: rider?.time,
    };
}

/**
 * Rides an endurance track with random inputs, starting over a while after each fall, the events
 * of the run received by another endurance track of the same seed in random batches, a few ticks
 * late. Its own player restarts now and then, crashing at once: only the rider keeps sections on
 * that track, taken off behind them and put back at the start whenever they start over.
 */
function rideAndReplay(seed: number, ticks: number) {
    const random = seededRandom(seed);
    const networkRandom = seededRandom(seed + 100);
    const sender = createCourse();
    const receiver = createCourse();
    const player = sender.track.playerRunner;
    const reporter = new RunReporter(player);
    const remote = new RemoteRunner(receiver.track, 'Rider');
    receiver.track.remoteRunners.set('rider', remote);
    receiver.track.playerRunner.crash(true);

    const inFlight: Array<{ at: number; events: RunEvent[] }> = [
        { at: 0, events: reporter.resync() },
    ];
    const joins: Array<{ events: RunEvent[]; state: ReturnType<typeof stateOf> }> = [];
    let falls = 0;
    let fallenAt: number | null = null;

    for (let t = 0; t < ticks; t++) {
        for (const key of KEYS) {
            const pressed = key === 'up' ? random() < 0.95 : random() < 0.04;
            (pressed ? pressKey : releaseKey)(key);
        }
        tick(sender);

        // Starting over a while after falling
        if (sender.riderOf(player)?.over) {
            fallenAt ??= t;
            if (t - fallenAt > 30) {
                falls++;
                fallenAt = null;
                joins.push({ events: reporter.resync(), state: stateOf(sender, player) });
                sender.track.restart();
            }
        }

        if (networkRandom() < 0.3) {
            inFlight.push({ at: t + Math.floor(networkRandom() * 10), events: reporter.flush() });
        }
        while (inFlight.length && inFlight[0].at <= t) {
            remote.receive(inFlight.shift()!.events);
        }
        // The player of the other track restarts at the start, the rider riding on
        if (t % 400 === 399) {
            receiver.track.restart();
            receiver.track.playerRunner.crash(true);
        }
        tick(receiver);
    }

    remote.receive(inFlight.flatMap(({ events }) => events));
    remote.receive(reporter.flush());
    for (let i = 0; i < 10000 && remote.lag > 0; i++) {
        tick(receiver);
    }
    joins.push({ events: reporter.resync(), state: stateOf(sender, player) });
    return { sender, receiver, remote, falls, joins };
}

describe('Live endurance', () => {
    test.each([1, 2, 3])(
        'replays the runs of a rider exactly, falls and restarts included, ride %i',
        (seed) => {
            const { sender, receiver, remote, falls } = rideAndReplay(seed, 1500);

            expect(falls).toBeGreaterThan(0);
            expect(remote.desynced).toBe(false);
            expect(stateOf(receiver, remote)).toEqual(stateOf(sender, sender.track.playerRunner));
        },
    );

    test('replays the whole run for a rider joining late, ending in the same state', () => {
        const { joins } = rideAndReplay(1, 1500);

        for (const { events, state } of joins) {
            const late = createCourse();
            const remote = new RemoteRunner(late.track, 'Late');
            late.track.remoteRunners.set('late', remote);
            remote.receive(events);
            for (let i = 0; i < 10000 && remote.lag > 0; i++) {
                tick(late);
            }
            expect(stateOf(late, remote)).toEqual(state);
        }
    });

    test('ends the runs where the verifier does', () => {
        // The last run over, before its restart
        const fall = rideAndReplay(2, 1500)
            .joins.filter((join) => join.state.over)
            .pop();
        expect(fall).toBeDefined();
        const { events, state } = fall!;

        // Its ghost string: its inputs until the last tick alive, as the game uploads it
        const time = state.riderTime ?? 0;
        const ghostString = [
            ...CONTROL_NAMES.map((control) =>
                events
                    .flatMap((event) =>
                        event.type === 'toggle' && event.control === control && event.time <= time
                            ? [event.time]
                            : [],
                    )
                    .join(' '),
            ),
            time,
            'BMX',
        ].join(',');
        const verdict = GhostVerifier.verifyEndurance(SEED, 1, ghostString, time, {
            maxTicks: 10000,
            deadline: Number.MAX_SAFE_INTEGER,
        });

        expect(verdict).toMatchObject({ valid: true, distance: state.distance });
    });
});
