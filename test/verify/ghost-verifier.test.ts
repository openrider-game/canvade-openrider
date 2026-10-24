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

const LIMITS = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Ghost verifier', () => {
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
