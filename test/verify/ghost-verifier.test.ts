import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, pressKey, releaseKey, runTicks } from '../helpers/track';

/** Track 1 of the sample of the backend, and the ghost of `Rookie` finishing it. */
const TRACK_CODE =
    '-50 1i io 1i p0 a s4 a 12c 1i 3a8 1i#68 -4m 84 -5a aa -50 bs -5f do -4m,1l4 -68 1n0 -71' +
    ' 1pg -6i 1rc -76 1t8 -68,340 1i 340 -1s#C 1i0 18,T 340 18###BMX#0 0';
const GHOST = '0,,99 119,74 97 122 138 148 159,,227,BMX,Rookie';
const TIME = 227;

/**
 * Track 4 of the sample, its command blocks opening the way, and the ghost of `Operator` holding
 * the up key from the start.
 */
const COMMAND_TRACK_CODE =
    '-34 1i 1ug 1i 1ug e2 2e4 e2 2e4 1i 404 1i 404 -4m,1es -4m 1es 1i,1ug 1i 2e4 1i,374 -4m 374' +
    ' 1i#1du 1i 1du -5k 1fq -5k 1fq 1i,366 1i 366 -5k 382 -5k 382 1i,1u6 1i 1u6 0,2ee 1i 2ee 0,' +
    '13a k 14i k 148 a,1nk k 1os k 1oi a,2ms k 2o4 k 2nq a#A 7q 16 0 34,A fk 16 1 1es -u 2b,' +
    'A 13u 16 2 1e8 -5a 1fg 1s,A 1ji 16 0 18,A 1o8 16 3 1u6 18 2ee 1s,' +
    'A 2ng 16 4 36g -5a 37o 1s 0 -7q 1i,A 3dc 16 0 1s,C 2iq 16,T 3ps 16###BMX#0 0';
const COMMAND_GHOST = '0,,,,,212,BMX,Operator';

const LIMITS = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Ghost verifier', () => {
    test('accepts the sample run through the command blocks, refused without them', () => {
        expect(GhostVerifier.verify(COMMAND_TRACK_CODE, COMMAND_GHOST, 212, LIMITS)).toEqual({
            valid: true,
            reason: '',
        });

        // The door, the missing bridge and the sliding door stop the same run
        const withoutBlocks = COMMAND_TRACK_CODE.replace(/A [^,]*,/g, '');
        expect(GhostVerifier.verify(withoutBlocks, COMMAND_GHOST, 212, LIMITS).valid).toBe(false);
    });

    test('accepts a recorded run, finishing at its time', () => {
        expect(GhostVerifier.verify(TRACK_CODE, GHOST, TIME, LIMITS)).toEqual({
            valid: true,
            reason: '',
        });
    });

    test('accepts a segmented run, restarted from a checkpoint', () => {
        // A checkpoint, then the target further on a flat line
        const code = '-50 1i 2000 1i##C 50 18,T 9c 18###BMX#0 0';
        // Raced as a published track: the player only finishes races
        const track = parseTrack(code, 1);
        const runner = track.playerRunner;
        const ghosts: string[] = [];
        let mistakeAt = -1;
        let restarted = false;

        pressKey('up');
        runTicks(track, 1000, (time) => {
            // A mistake after the checkpoint: braking, then going back to the checkpoint
            if (runner.snapshots.length === 1 && mistakeAt < 0) {
                mistakeAt = time + 10;
            }
            if (time === mistakeAt && !restarted) {
                pressKey('down');
            } else if (time === mistakeAt + 20 && !restarted) {
                releaseKey('down');
                track.restart();
                restarted = true;
            }
            // Saved as the play state does once the race is finished
            if (runner.done && ghosts.length === 0) {
                ghosts.push(GhostParser.generate(runner));
            }
        });
        releaseKey('up');

        expect(restarted).toBe(true);
        expect(ghosts).toHaveLength(1);
        const ghost = GhostParser.parse(ghosts[0]);
        // The braking was dropped with the restart: the ghost only holds the kept segments
        expect([...(ghost.keys.get('downPressed') ?? [])]).toEqual([]);
        expect(GhostVerifier.verify(code, ghosts[0], ghost.time, LIMITS)).toEqual({
            valid: true,
            reason: '',
        });
    });

    test('refuses a time claimed apart from the ghost string', () => {
        const verdict = GhostVerifier.verify(TRACK_CODE, GHOST, TIME - 50, LIMITS);

        expect(verdict.valid).toBe(false);
        expect(verdict.reason).toContain('differs');
    });

    test('refuses a ghost string edited to finish sooner', () => {
        const faster = GHOST.replace(',227,', ',177,');

        expect(GhostVerifier.verify(TRACK_CODE, faster, 177, LIMITS).valid).toBe(false);
    });

    test('refuses a ghost string whose inputs do not finish the track', () => {
        // Inputs edited so that the run still finishes at its time would be a real run: valid
        const idle = ',,,,,227,BMX,Rookie';

        expect(GhostVerifier.verify(TRACK_CODE, idle, TIME, LIMITS).reason).toContain(
            'every target',
        );
    });

    test('refuses a ghost recorded later than its time', () => {
        // The run finishes at 227: claiming 300 does not match either
        const slower = GHOST.replace(',227,', ',300,');

        expect(GhostVerifier.verify(TRACK_CODE, slower, 300, LIMITS).reason).toContain(
            'another time',
        );
    });

    test('refuses the runs longer than the limit, and the tracks without target', () => {
        expect(
            GhostVerifier.verify(TRACK_CODE, GHOST, TIME, { ...LIMITS, maxTicks: 100 }).reason,
        ).toContain('too long');

        const noTarget = TRACK_CODE.replace(',T 340 18', '');
        expect(GhostVerifier.verify(noTarget, GHOST, TIME, LIMITS).reason).toContain('no target');
    });
});
