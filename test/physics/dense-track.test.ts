import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Track } from '../../src/openrider/track/track';
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
 * Golden tests of the physics on dense tracks: rough ground crowded with lines, overlapping in
 * the cells, and every kind of directional item at random whole rotations, ridden for a long while
 * with random controls. The positions of every point of the bike, and of its ragdoll or explosion,
 * are hashed bit for bit on every tick: any change of the physics, even of the order of the
 * floating point operations, changes the hash and would desync the recorded ghosts.
 *
 * The rides were recorded before optimizing the collisions, see `EXPECTED`: the rider dies and
 * goes back to its checkpoints in the first, rides the whole time in the others.
 */

const TICKS = 3000;

/** A dense track of a seed: its track code. */
function denseTrack(seed: number): string {
    const random = seededRandom(seed);
    const base32 = (value: number) => Math.round(value).toString(32);
    // The ground, a polyline of steps of 15 units, rough
    const ground: number[] = [];
    let y = 50;
    for (let x = -100; x < 12000; x += 15) {
        y += (random() - 0.52) * 18;
        ground.push(x, y);
    }
    // Short lines under the surface of the ground, crowding its cells: tested on every tick
    const crowd: string[] = [];
    for (let i = 0; i < 6000; i++) {
        const index = Math.floor(random() * (ground.length / 2 - 2)) * 2;
        const [x, gy] = [ground[index], ground[index + 1]];
        const top = gy + 6 + random() * 20;
        crowd.push([x, top, x + random() * 30 - 15, top + random() * 16 - 4].map(base32).join(' '));
    }
    // Directional items at whole rotations, slow-mos and checkpoints, then a target at the end
    const items: string[] = [];
    for (let i = 0; i < 400; i++) {
        const index = Math.floor(random() * (ground.length / 2 - 2)) * 2;
        const [x, gy] = [ground[index], ground[index + 1] - 10];
        const kind = ['B', 'G', 'S', 'C'][Math.floor(random() * 4)];
        const rotation = Math.floor(random() * 720) - 360;
        items.push(
            kind === 'B' || kind === 'G'
                ? `${kind} ${base32(x)} ${base32(gy)} ${base32(rotation)}`
                : `${kind} ${base32(x)} ${base32(gy)}`,
        );
    }
    items.push(`T ${base32(11900)} ${base32(y - 10)}`);
    // Scenery over the ground, which the bikes go through
    const scenery = crowd.slice(0, 2000).join(',');
    return `${ground.map(base32).join(' ')},${crowd.join(',')}#${scenery}#${items.join(',')}###BMX#0 0`;
}

/** FNV-1a hash of numbers, bit for bit: their bytes as `Float64`. */
function hashNumbers(hash: number, values: number[]): number {
    const bytes = new Uint8Array(new Float64Array(values).buffer);
    for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    }
    return hash;
}

/** Rides a track with random controls of a seed, hashing the points on every tick. */
function ride(track: Track, seed: number) {
    const random = seededRandom(seed);
    const runner = track.playerRunner;
    const held = new Set<PlayerKey>();
    let hash = 2166136261;
    let alive = 0;
    let deadFor = 0;
    let restarts = 0;

    runTicks(track, TICKS, () => {
        // A key toggled now and then, mostly riding forward
        if (random() < 0.08) {
            const keys = Object.keys(PLAYER_KEYS) as PlayerKey[];
            const key = random() < 0.4 ? 'up' : keys[Math.floor(random() * keys.length)];
            if (held.has(key)) {
                releaseKey(key);
                held.delete(key);
            } else {
                pressKey(key);
                held.add(key);
            }
        }
        // Dead for a while: back to the last checkpoint, as the player would
        deadFor = runner.dead ? deadFor + 1 : 0;
        if (deadFor > 60) {
            track.restart();
            restarts++;
        }
        if (!runner.dead) alive++;
        const points = [...(runner.instance?.points ?? []), ...(runner.deadObject?.points ?? [])];
        hash = hashNumbers(
            hash,
            points.flatMap((point) => [point.pos.x, point.pos.y]),
        );
    });
    held.forEach((key) => releaseKey(key));

    return {
        hash,
        alive,
        restarts,
        time: runner.time,
        dead: runner.dead,
        targets: runner.targetsReached.size,
        checkpoints: runner.snapshots.length,
    };
}

/** The rides of each seed, recorded before optimizing the collisions. */
const EXPECTED: Record<number, ReturnType<typeof ride>> = {
    1: {
        hash: 3018275925,
        alive: 592,
        restarts: 40,
        time: 510,
        dead: true,
        targets: 0,
        checkpoints: 2,
    },
    2: {
        hash: 3306013731,
        alive: 3000,
        restarts: 0,
        time: 3000,
        dead: false,
        targets: 0,
        checkpoints: 0,
    },
    3: {
        hash: 620984593,
        alive: 3000,
        restarts: 0,
        time: 3000,
        dead: false,
        targets: 0,
        checkpoints: 2,
    },
    4: {
        hash: 280229471,
        alive: 3000,
        restarts: 0,
        time: 3000,
        dead: false,
        targets: 0,
        checkpoints: 1,
    },
};

describe('Physics on dense tracks', () => {
    beforeEach(() => {
        stubBrowser();
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(7));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test.each([1, 2, 3, 4])('ride the dense track of seed %i as recorded', (seed) => {
        const result = ride(parseTrack(denseTrack(seed)), seed * 31);
        expect(result).toEqual(EXPECTED[seed]);
    });

    test.each([1, 3])('ride the same without drawing, as the verifier, seed %i', (seed) => {
        const track = parseTrack(denseTrack(seed), null, true);
        // Neither render cache nor scenery, which the bikes go through
        const layer = track.layers.main[0];
        expect(layer.cache.cells.size).toBe(0);
        expect(layer.grid.totalSceneryLines.size).toBe(0);
        expect(ride(track, seed * 31)).toEqual(EXPECTED[seed]);
    });
});
