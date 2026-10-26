import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, runTicks } from '../helpers/track';

/**
 * Track 4 of the sample of the backend, its command blocks opening the way over time (a door, a
 * bridge, a sliding door), and the ghost of `Operator` holding the up key from the start.
 */
const COMMAND_TRACK_CODE =
    '-34 1i 1ug 1i 1ug e2 2e4 e2 2e4 1i 404 1i 404 -4m,1es -4m 1es 1i,1ug 1i 2e4 1i,374 -4m 374' +
    ' 1i#1du 1i 1du -5k 1fq -5k 1fq 1i,366 1i 366 -5k 382 -5k 382 1i,1u6 1i 1u6 0,2ee 1i 2ee 0,' +
    '13a k 14i k 148 a,1nk k 1os k 1oi a,2ms k 2o4 k 2nq a#A 7q 16 0 34,A fk 16 1 1es -u 2b,' +
    'A 13u 16 2 1e8 -5a 1fg 1s,A 1ji 16 0 18,A 1o8 16 3 1u6 18 2ee 1s,' +
    'A 2ng 16 4 36g -5a 37o 1s 0 -7q 1i,A 3dc 16 0 1s,C 2iq 16,T 3ps 16###BMX#0 0';
const COMMAND_GHOST = '0,,,,,212,BMX,Operator';
const TIME = 212;

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Adds the ghost of `Operator` to the track, at the start. */
function addGhost(track: Track, id: number): GhostRunner {
    const ghost = new GhostRunner(track, COMMAND_GHOST, false);
    ghost.createBike();
    ghost.startFrom();
    track.ghostRunners.set(id, ghost);
    return ghost;
}

describe('Time of the runs', () => {
    test('is counted by each runner, the track showing the one of the player', () => {
        const track = parseTrack(COMMAND_TRACK_CODE, 1);
        const ghost = addGhost(track, 1);

        runTicks(track, 50);
        expect(track.playerRunner.time).toBe(50);
        expect(ghost.time).toBe(50);
        expect(track.time).toBe(50);

        // Restarting the player alone leaves the ghost riding
        track.playerRunner.restart();
        runTicks(track, 10);
        expect(track.time).toBe(10);
        expect(ghost.time).toBe(60);
    });

    test('lets a runner ride at its own pace, replaying its run identically', () => {
        const track = parseTrack(COMMAND_TRACK_CODE, 1);
        const onTime = addGhost(track, 1);

        // A second ghost starts its run 60 ticks after the player and the first one, then rides
        // the same ticks: the command blocks open the way on its own time
        runTicks(track, 60);
        const late = addGhost(track, 2);
        runTicks(track, TIME);

        expect(onTime.done).toBe(true);
        expect(late.done).toBe(true);
        expect(onTime.time).toBe(TIME);
        expect(late.time).toBe(TIME);
        expect(track.time).toBe(TIME + 60);
        expect(late.instance?.hitbox.pos).toEqual(onTime.instance?.hitbox.pos);
        expect(late.commandTimes).toEqual(onTime.commandTimes);
    });
});
