import { Keyboard } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { stubBrowser } from '../helpers/canvas';
import {
    parseTrack,
    PlayerKey,
    PLAYER_KEYS,
    pressKey,
    releaseKey,
    runTicks,
    seededRandom,
} from '../helpers/track';

/**
 * Regression tests of the physics.
 *
 * The port reproduces the original JavaScript game bit for bit: the positions of these scenarios
 * were checked tick by tick against the original game, then stored as snapshots. Any change of
 * the physics, even of the order of the floating point operations, breaks them and would desync
 * the recorded ghosts.
 */

const TICKS = 600;
// Positions are recorded every few ticks, a divergence growing quickly enough to be caught
const SAMPLE_PERIOD = 30;

const SCENARIOS: Record<string, string> = {
    'items: target, checkpoint, boost, teleporter, reset, slow-mo, gravity':
        '-50 1i 2000 1i,4o 1i 5k 18 6g 1i#0 0 a a#T 9c 18,C 50 18,B 2s 18 0,W 4o 18 6g 18,' +
        'R 3c 18,S 7s 18,G a0 18 -2s#0 -a a -a##BMX#0 0',
    'status effects: slippery, no steer, engine off, invincibility':
        '-50 1i 2000 1i#0 0 a a#H 2s 18,N 50 18,E 9c 18,I 4o 18#0 -a a -a##MTB#0 0',
    'crash into a wall (ragdoll)': '-50 1i 2000 1i,b0 1i b0 -40##C 50 18###BMX#0 0',
    'bomb (explosion)': '-50 1i 2000 1i##O 64 18###MTB#0 0',
    'hills and flips': '-50 1i 80 1i 100 10 140 1i 1k0 1i 1o0 0 2k0 1i#####BMX#0 0',
};

/** Keys held at each tick: riding with a few leans, a brake and a turn. */
function heldKeys(time: number): Set<PlayerKey> {
    const keys = new Set<PlayerKey>();
    if (time < 260 || time > 300) keys.add('up');
    if (time > 60 && time < 75) keys.add('left');
    if (time > 110 && time < 125) keys.add('right');
    if (time > 200 && time < 215) keys.add('down');
    if (time === 240) keys.add('turn');
    return keys;
}

function ride(code: string) {
    const track = parseTrack(code);
    const runner = track.playerRunner;
    const held = new Set<PlayerKey>();
    const frames: number[][] = [];

    runTicks(track, TICKS, (time) => {
        const wanted = heldKeys(time);
        for (const key of Object.keys(PLAYER_KEYS) as PlayerKey[]) {
            if (wanted.has(key) && !held.has(key)) {
                pressKey(key);
                held.add(key);
            } else if (!wanted.has(key) && held.has(key)) {
                releaseKey(key);
                held.delete(key);
            }
        }

        if (time % SAMPLE_PERIOD === 0) {
            const points = [
                ...(runner.instance?.points ?? []),
                ...(runner.deadObject?.points ?? []),
            ];
            frames.push([time, ...points.flatMap((point) => [point.pos.x, point.pos.y])]);
        }
    });

    held.forEach((key) => releaseKey(key));

    return {
        frames,
        targetsReached: runner.targetsReached.size,
        checkpoints: runner.snapshots.length,
        dead: runner.dead,
        exploded: runner.instance === null,
        modifiersMask: runner.modifiersMask,
        ghost: runner.instance ? GhostParser.generate(runner) : null,
    };
}

describe('Physics', () => {
    beforeEach(() => {
        stubBrowser();
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test.each(Object.entries(SCENARIOS))('reproduces the original game: %s', (_name, code) => {
        expect(ride(code)).toMatchSnapshot();
    });

    test('is deterministic', () => {
        const code = SCENARIOS['hills and flips'];
        const first = ride(code);
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
        const second = ride(code);

        expect(second).toEqual(first);
    });

    test('records the inputs of the player as a ghost string', () => {
        const { ghost } = ride(
            SCENARIOS['status effects: slippery, no steer, engine off, invincibility'],
        );
        const parsed = GhostParser.parse(ghost ?? '');

        // Up pressed at 0, released at 260 and pressed again at 301; the turn key at 240 only
        expect([...(parsed.keys.get('upPressed') ?? [])]).toEqual([0, 260, 301]);
        expect([...(parsed.keys.get('turnPressed') ?? [])]).toEqual([240, 241]);
        expect(parsed.time).toBe(TICKS);
        expect(parsed.bike.bikeName).toBe('MTB');
        expect(Keyboard.isDown('Up')).toBe(false);
    });
});
