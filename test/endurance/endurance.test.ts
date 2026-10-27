import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { RemoteRunner } from '../../src/openrider/bike/runner/remote-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import {
    BACK_LIMIT,
    DIFFICULTY_DISTANCE,
    LOADED_AHEAD,
    LOADED_BEHIND,
    POST_SPACING,
    SECTION_LENGTH,
    UNITS_PER_METER,
} from '../../src/openrider/endurance/endurance.constants';
import { EnduranceRecords } from '../../src/openrider/endurance/endurance-records';
import { EnduranceRun } from '../../src/openrider/endurance/endurance-run';
import { SeededRandom } from '../../src/openrider/endurance/seeded-random';
import {
    BIOME_DECORATIONS,
    decorateSection,
} from '../../src/openrider/endurance/decoration/decorate';
import { DecorFactory } from '../../src/openrider/endurance/decoration/decor-factory';
import { generatorVersion } from '../../src/openrider/endurance/terrain/versions';
import { TerrainGenerator } from '../../src/openrider/endurance/terrain-generator';
import { Point, TrackSection } from '../../src/openrider/endurance/terrain.types';
import { EnduranceService } from '../../src/openrider/request/endurance-service';
import { GhostService } from '../../src/openrider/request/ghost-service';
import { MODIFIERS } from '../../src/openrider/item/modifiers';
import { Track } from '../../src/openrider/track/track';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { pressKey, releaseKey } from '../helpers/track';

/** Storage double, as the one of the browser. */
function memoryStorage(): Storage {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
}

/** A new endurance track with its course and the bike of the player. */
function createCourse(seed: number): EnduranceCourse {
    const track = new Track(null);
    track.canvas = createCanvasMock().canvas;
    const course = new EnduranceCourse(track, seed);
    track.playerRunner.createBike();
    return course;
}

/**
 * Moves the bike of a runner to a position along the course, above the fall limit there: only
 * for the loading of the sections, the bike being anywhere in the terrain.
 */
function moveBike(course: EnduranceCourse, runner: BikeRunner, x: number): void {
    const bike = runner.instance;
    if (!bike) throw new Error('No bike');
    const shift = new Vector(x, course.fallLimitAt(x) - 500).sub(bike.hitbox.pos);
    bike.points.forEach((point) => point.pos.selfAdd(shift));
}

/** Runs a physics tick of the runners, as the play states do. */
function tickRace(track: Track): void {
    track.playerRunner.fixedUpdate();
    track.ghostRunners.forEach((ghost) => ghost.fixedUpdate());
}

/** Rides holding the up key until the rider falls, returning the run of the player. */
function rideUntilFall(course: EnduranceCourse, maxTicks = 6000): EnduranceRun {
    const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
    pressKey('up');
    for (let tick = 0; tick < maxTicks && !run.over; tick++) {
        tickRace(course.track);
        run.update();
    }
    releaseKey('up');
    return run;
}

/** Gaps of the ground of the sections: from the end of a polyline to the start of the next. */
function gaps(generator: TerrainGenerator, sections: number[]): number[] {
    const polylines = sections.flatMap((index) => generator.section(index).solid);
    return polylines.slice(1).map((points, i) => {
        const previous = polylines[i];
        return points[0][0] - previous[previous.length - 1][0];
    });
}

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
    GameConfig.mode = 'tracks';
    GameConfig.seed = null;
    GameConfig.enduranceSave = false;
    GameConfig.enduranceBest = null;
});

describe('Seeded random numbers', () => {
    test('are the same for a seed, and differ between seeds', () => {
        const numbers = (seed: number) => {
            const random = new SeededRandom(seed);
            return Array.from({ length: 5 }, () => random.next());
        };

        expect(numbers(42)).toEqual(numbers(42));
        expect(numbers(42)).not.toEqual(numbers(43));
        expect(numbers(42).every((n) => n >= 0 && n < 1)).toBe(true);
    });

    test('pick by weight, never the keys of weight 0', () => {
        const random = new SeededRandom(1);
        const picks = Array.from({ length: 1000 }, () => random.pick({ a: 3, b: 1, c: 0 }));

        expect(picks).not.toContain('c');
        const share = picks.filter((pick) => pick === 'a').length / picks.length;
        expect(share).toBeGreaterThan(0.7);
        expect(share).toBeLessThan(0.8);
    });
});

describe('Decoration', () => {
    test('is made of decors created by name, those of the biomes being all known', () => {
        const terrain = generatorVersion(2).biomes?.map((biome) => biome.name) ?? [];
        for (const [biome, decoration] of BIOME_DECORATIONS) {
            expect(terrain).toContain(biome);
            const decors = Object.keys(decoration.decors).map((name) => DecorFactory.create(name));
            // Hanging from the ceilings with a spacing of their own
            const hanging = decors.some((decor) => decor.placement === 'ceiling');
            expect(decoration.ceilingSpacing !== undefined).toBe(hanging);
        }
        expect(new Set(DecorFactory.names()).size).toBe(DecorFactory.names().length);
        expect(DecorFactory.create('tree')).toBe(DecorFactory.create('tree'));
        expect(() => DecorFactory.create('castle')).toThrow('Unknown decor');
    });

    test('draws each decor within the room it takes', () => {
        for (const name of DecorFactory.names()) {
            const decor = DecorFactory.create(name);
            for (let seed = 0; seed < 50; seed++) {
                const points = decor.draw(0, 0, new SeededRandom(seed)).flat();
                expect(points.length).toBeGreaterThan(1);
                const ys = points.map(([, y]) => y);
                if (decor.placement === 'ground') {
                    // Up from the ground, no higher than its height
                    expect(Math.max(...ys)).toBeLessThanOrEqual(0.01);
                    expect(-Math.min(...ys)).toBeLessThanOrEqual(decor.height);
                } else if (decor.placement === 'ceiling') {
                    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.01);
                    expect(Math.max(...ys)).toBeLessThanOrEqual(decor.height);
                } else {
                    // High in the sky, over the tallest decors
                    expect(-Math.max(...ys)).toBeGreaterThan(150);
                }
            }
        }
    });
});

describe('Biomes', () => {
    /** Biomes of the first sections of the track of a seed, on the version with biomes. */
    const biomesOf = (seed: number, count = 200) => {
        const generator = new TerrainGenerator(seed, 0, 50, 2);
        return Array.from({ length: count }, (_, index) => generator.section(index));
    };
    /** Biomes one after another, with their number of sections. */
    const spans = (sections: TrackSection[]) =>
        sections.reduce<Array<{ biome: string; length: number }>>((spans, section) => {
            const last = spans[spans.length - 1];
            if (last?.biome === section.biome) {
                last.length++;
            } else {
                spans.push({ biome: section.biome ?? '', length: 1 });
            }
            return spans;
        }, []);

    test('follow each other from a meadow, for 5 to 10 sections, the same for a seed', () => {
        expect(biomesOf(7)).toEqual(biomesOf(7));
        for (const seed of [1, 2, 3]) {
            const all = spans(biomesOf(seed));
            expect(all[0].biome).toBe('Meadow');
            expect(all.length).toBeGreaterThan(10);
            // The last one may go on after the sections asked
            for (const { length } of all.slice(0, -1)) {
                expect(length).toBeGreaterThanOrEqual(5);
                expect(length).toBeLessThanOrEqual(10);
            }
            expect(new Set(all.map((span) => span.biome)).size).toBeGreaterThan(3);
        }
        // The versions without biomes do not tell any
        expect(new TerrainGenerator(7, 0, 50, 1).section(3).biome).toBeUndefined();
    });

    test('are decorated after their biome, the same for a seed, apart from the terrain', () => {
        const sections = biomesOf(3, 150);
        const decorate = (section: TrackSection) => decorateSection(section, 3, 0);
        const terrain = JSON.stringify(sections);

        // Each biome, the stalactites of the caves hanging under their ceilings
        const decorated = new Set(
            sections
                .filter((section) => decorate(section).length > 0)
                .map((section) => section.biome),
        );
        expect([...decorated].sort()).toEqual(['Arctic', 'Canyon', 'Caves', 'Meadow', 'Mountains']);
        const caves = sections.filter((section) => section.biome === 'Caves');
        const underCeilings = caves
            .flatMap(decorate)
            .filter(([start]) =>
                caves.some((section) =>
                    section.ceilings.some((points) =>
                        points.some(
                            ([x, y]) => Math.abs(x - start[0]) < 50 && Math.abs(y - start[1]) < 5,
                        ),
                    ),
                ),
            );
        expect(underCeilings.length).toBeGreaterThan(0);

        for (const section of sections) {
            expect(decorate(section)).toEqual(decorate(section));
            // Few enough lines to keep the cells fast to render
            const segments = decorate(section).reduce((sum, points) => sum + points.length - 1, 0);
            expect(segments).toBeLessThan(400);
            // Clear of the items
            for (const [x, y] of decorate(section).flat()) {
                for (const item of section.items) {
                    expect(Math.hypot(x - item.x, y - item.y)).toBeGreaterThan(15);
                }
            }
        }
        // The terrain stays the same, and the versions without biomes are not decorated
        expect(JSON.stringify(sections)).toBe(terrain);
        const plain = new TerrainGenerator(3, 0, 50, 1);
        expect(decorateSection(plain.section(4), 3, 0)).toEqual([]);
    });

    test('change the obstacles of the sections: tunnels in caves, gaps in canyons', () => {
        const sections = [1, 2, 3, 4, 5].flatMap((seed) => biomesOf(seed, 300));
        /** Share of the obstacles of a biome among the given ones. */
        const share = (biome: string, kinds: string[]) => {
            const parts = sections
                .filter((section) => section.biome === biome)
                .flatMap((section) => section.parts);
            return parts.filter((part) => kinds.includes(part.kind)).length / parts.length;
        };
        const others = (biome: string, kinds: string[]) =>
            ['Meadow', 'Mountains', 'Canyon', 'Caves', 'Arctic']
                .filter((other) => other !== biome)
                .map((other) => share(other, kinds));

        const caves = ['tunnel', 'ceiling'];
        expect(share('Caves', caves)).toBeGreaterThan(Math.max(...others('Caves', caves)));
        const gaps = ['launchGap', 'islands'];
        expect(share('Canyon', gaps)).toBeGreaterThan(Math.max(...others('Canyon', gaps)));
        const slopes = ['climb', 'downhill'];
        expect(share('Mountains', slopes)).toBeGreaterThan(share('Meadow', slopes));
        expect(share('Arctic', ['ice zone'])).toBeGreaterThan(share('Canyon', ['ice zone']));
    });
});

describe('Terrain generator', () => {
    test('generates the same track for a seed, another one for another seed', () => {
        const first = new TerrainGenerator(7, 0, 50);
        const second = new TerrainGenerator(7, 0, 50);
        const other = new TerrainGenerator(8, 0, 50);

        expect(second.section(10)).toEqual(first.section(10));
        expect(other.section(10)).not.toEqual(first.section(10));
    });

    test('goes on from section to section, in lines the track keeps', () => {
        const generator = new TerrainGenerator(3, 0, 50);

        for (let index = 1; index < 30; index++) {
            const previous = generator.section(index - 1);
            const section = generator.section(index);
            expect(section.startX).toBe(previous.endX);
            expect(section.endX - section.startX).toBeGreaterThanOrEqual(SECTION_LENGTH);

            for (const points of section.solid) {
                points.slice(1).forEach((point: Point, i) => {
                    const length = Math.hypot(point[0] - points[i][0], point[1] - points[i][1]);
                    expect(length).toBeGreaterThanOrEqual(2);
                    // Always going forward: the generated ground never folds back
                    expect(point[0]).toBeGreaterThan(points[i][0]);
                });
            }
        }
    });

    test('starts flat under the start position, without gaps at first', () => {
        const generator = new TerrainGenerator(5, 0, 50);
        const start = generator.section(0);

        expect(start.solid[0].slice(0, 2)).toEqual([
            [-200, 50],
            [600, 50],
        ]);
        expect(gaps(generator, [0])).toEqual([]);
        expect(start.items).toEqual([]);
    });

    test('gets harder with the distance: wider gaps, then bombs', () => {
        const generator = new TerrainGenerator(11, 0, 50);
        // Sections over a difficulty range, 1200 units each adding 0.04 to the difficulty
        const sectionsAt = (difficulty: number, count: number) => {
            const index = generator.sectionIndexAt(difficulty * DIFFICULTY_DISTANCE);
            return Array.from({ length: count }, (_, i) => index + i);
        };
        const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

        // More void to cross, in wider gaps
        const easy = gaps(generator, sectionsAt(0.1, 8));
        const hard = gaps(generator, sectionsAt(1, 8));
        expect(sum(hard)).toBeGreaterThan(sum(easy) * 1.5);
        expect(sum(hard) / hard.length).toBeGreaterThan((sum(easy) / easy.length) * 1.5);

        const items = (difficulty: number) =>
            sectionsAt(difficulty, 8).flatMap((index) => generator.section(index).items);
        // From difficulty 0.1 to 0.4: no bombs yet, from 0.45 on
        expect(items(0.1).some((item) => item.kind === 'bomb')).toBe(false);
        expect(items(1).some((item) => item.kind === 'bomb')).toBe(true);
        expect(generator.difficultyAt(100 * DIFFICULTY_DISTANCE)).toBe(2);
    });

    test('mixes every obstacle, zone and item along a long track', () => {
        const generator = new TerrainGenerator(21, 0, 50);
        const sections = Array.from({ length: 80 }, (_, i) => generator.section(i));
        const kinds = new Set(sections.flatMap((section) => section.parts.map((p) => p.kind)));
        const items = new Set(sections.flatMap((section) => section.items.map((i) => i.kind)));

        for (const obstacle of ['valley', 'stairs', 'islands', 'tunnel', 'launchGap', 'mudPit']) {
            expect(kinds).toContain(obstacle);
        }
        expect([...kinds].filter((kind) => kind.endsWith(' zone')).length).toBeGreaterThanOrEqual(
            6,
        );
        for (const item of ['launcher', 'mud', 'slowMo', 'lowGravity', 'turbo', 'reset']) {
            expect(items).toContain(item);
        }
        // The tunnels have their ceiling
        expect(sections.some((section) => section.ceilings.length > 0)).toBe(true);
    });

    test('ends every zone with a column of reset items', () => {
        const generator = new TerrainGenerator(21, 0, 50);
        const items = Array.from({ length: 80 }, (_, i) => generator.section(i).items).flat();
        const effects = items.filter(
            (item) => !['boost', 'launcher', 'bomb', 'mud', 'slowMo', 'reset'].includes(item.kind),
        );

        // Each effect, given twice at the start of its zone, has resets after it
        for (const effect of effects) {
            const resets = items.filter((item) => item.kind === 'reset' && item.x > effect.x);
            expect(resets.length).toBeGreaterThanOrEqual(7);
            const column = resets.filter((item) => item.x === resets[0].x);
            expect(column.length).toBe(7);
            // From the wheels to well over the rider
            expect(
                Math.max(...column.map((i) => i.y)) - Math.min(...column.map((i) => i.y)),
            ).toBeGreaterThan(150);
        }
        expect(effects.length).toBeGreaterThan(0);
    });

    test('places a distance post every 100 m', () => {
        const generator = new TerrainGenerator(2, 0, 50);
        const end = generator.sectionIndexAt(10 * POST_SPACING);
        const posts = Array.from({ length: end }, (_, i) => generator.section(i).scenery)
            .flat()
            // The post itself, the flag being drawn from its top
            .filter((points) => points.length === 2 && points[0][0] === points[1][0])
            .map((points) => points[0][0]);

        // Posts in the gaps are left out
        expect(posts.length).toBeGreaterThanOrEqual(8);
        posts.forEach((x) => expect(x % POST_SPACING).toBe(0));
    });
});

describe('Endurance course', () => {
    test('keeps on the track the sections around the bike only', () => {
        const course = createCourse(4);
        const solidLines = () => course.track.layers.main[0].grid.totalSolidLines;
        const xs = () => [...solidLines().values()].map((line) => line.pos.x);

        expect(Math.max(...xs())).toBeGreaterThanOrEqual(LOADED_AHEAD);

        const runner = course.track.playerRunner;
        moveBike(course, runner, 20000);
        course.step();
        expect(Math.min(...xs())).toBeGreaterThan(20000 - LOADED_BEHIND - 2 * SECTION_LENGTH);
        expect(Math.min(...xs())).toBeLessThanOrEqual(20000 - LOADED_BEHIND);
        expect(Math.max(...xs())).toBeGreaterThanOrEqual(20000 + LOADED_AHEAD);
        expect(Math.max(...xs())).toBeLessThan(20000 + LOADED_AHEAD + 2 * SECTION_LENGTH);

        // Riding back too far ends the run, the sections behind staying off the track
        const lines = xs();
        moveBike(course, runner, 20000 - BACK_LIMIT - 10);
        course.step();
        expect(runner.dead).toBe(true);
        expect(xs()).toEqual(lines);

        // Restarting starts over at the start, before the next physics tick
        course.track.restart();
        expect(Math.min(...xs())).toBeLessThan(0);
        expect(Math.max(...xs())).toBeLessThan(LOADED_AHEAD + 2 * SECTION_LENGTH);
    });

    test('keeps the sections of the slowest running bike, and loads ahead of the furthest', () => {
        const course = createCourse(4);
        const track = course.track;
        const ghost = new GhostRunner(track, ',,,,,100,BMX', false);
        ghost.createBike();
        track.ghostRunners.set(1, ghost);
        const xs = () =>
            [...track.layers.main[0].grid.totalSolidLines.values()].map((line) => line.pos.x);

        moveBike(course, track.playerRunner, 20000);
        course.step();
        // The ghost is still at the start
        expect(Math.min(...xs())).toBeLessThan(0);
        expect(Math.max(...xs())).toBeGreaterThanOrEqual(20000 + LOADED_AHEAD);

        // Once the run of the ghost is over, only the player counts
        ghost.crash(true);
        course.step();
        expect(Math.min(...xs())).toBeGreaterThan(20000 - LOADED_BEHIND - 2 * SECTION_LENGTH);
    });

    test('keeps the sections of the riders of the live session, whatever the player does', () => {
        const course = createCourse(4);
        const track = course.track;
        const remote = new RemoteRunner(track, 'Rider');
        track.remoteRunners.set('rider', remote);
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            { type: 'progress', time: 1 },
        ]);
        remote.advance();
        const xs = () =>
            [...track.layers.main[0].grid.totalSolidLines.values()].map((line) => line.pos.x);
        const has = (x: number) => xs().some((lineX) => Math.abs(lineX - x) < SECTION_LENGTH);

        // The rider rides far ahead: followed after their own tick
        moveBike(course, remote, 20000);
        track.onRemoteTick?.(remote);
        expect(has(20000 + LOADED_AHEAD)).toBe(true);
        expect(has(0)).toBe(true);

        // The player restarts: the start is there, and the sections of the rider stay
        track.restart();
        expect(has(0)).toBe(true);
        expect(has(20000)).toBe(true);

        // The player crashed: only the rider keeps sections, then they start over
        track.playerRunner.crash(true);
        course.step();
        expect(has(0)).toBe(false);
        remote.startFrom();
        expect(has(0)).toBe(true);
        expect(has(20000)).toBe(false);
    });

    test('tells the distance in meters, and where a bike falls into a gap', () => {
        const course = createCourse(4);

        expect(course.distanceAt(40 * UNITS_PER_METER)).toBe(40);
        expect(course.distanceAt(-100)).toBe(0);
        expect(course.fallLimitAt(0)).toBeGreaterThan(50);
    });

    test('puts the items of the sections on the track, as the items of the game', () => {
        const course = createCourse(21);
        // Far enough for every kind of item, see the generator tests
        const kinds = new Set<string>();
        for (let x = 0; x < 80 * SECTION_LENGTH; x += LOADED_AHEAD) {
            moveBike(course, course.track.playerRunner, x);
            course.step();
            course.track.layers.main[0].grid.totalObjects.forEach((item) =>
                kinds.add(item.itemClass.itemName),
            );
        }

        for (const name of ['Launcher', 'Mud', 'Slow-Motion', 'Low Gravity', 'Turbo', 'Reset']) {
            expect(kinds).toContain(name);
        }
    });

    test('keeps the objects of each cell in order, whatever order the sections are added in', () => {
        const course = createCourse(21);
        // Far enough for many sections, items included
        for (let x = 0; x < 20 * SECTION_LENGTH; x += LOADED_AHEAD) {
            moveBike(course, course.track.playerRunner, x);
            course.step();
        }
        const grid = course.track.layers.main[0].grid;
        const cells = () =>
            [...grid.cells.entries()]
                .map(([key, cell]) => [
                    key,
                    [...cell.lines, ...cell.scenery, ...cell.objects].map((object) => object.id),
                ])
                .filter(([, ids]) => ids.length > 0);
        const ordered = cells();
        expect(grid.totalObjects.size).toBeGreaterThan(0);

        // Taken off, then added back from the last section to the first
        const objects = [
            ...grid.totalSolidLines.values(),
            ...grid.totalSceneryLines.values(),
            ...grid.totalObjects.values(),
        ].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
        objects.forEach((object) => object.removeFromTrack());
        objects.forEach((object) => object.addToTrack());

        expect(cells()).toEqual(ordered);
    });

    test('generates another track from another seed', () => {
        const lines = (course: EnduranceCourse) =>
            [...course.track.layers.main[0].grid.totalSolidLines.values()].map(
                (line) => `${line.pos.x},${line.pos.y}`,
            );
        const course = createCourse(4);

        expect(lines(createCourse(5))).not.toEqual(lines(course));
        expect(EnduranceCourse.of(course.track)).toBe(course);
        expect(EnduranceCourse.of(new Track(null))).toBeNull();
    });
});

describe('Endurance ghosts', () => {
    /** Response double of the ghost endpoint. */
    const ghostResponse = () =>
        Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ GHOSTSTRING: '0,,,,,100,BMX,Rival' }),
        } as Response);

    test('only race on the track of the page, asked to the backend for it', async () => {
        GameConfig.seed = 4;
        const course = createCourse(4);
        const fetch = vi.fn(ghostResponse);
        vi.stubGlobal('fetch', fetch);

        expect(GhostService.canRace(course.track)).toBe(true);
        await GhostService.toggleGhost(course.track, 3);
        expect([...course.track.ghostRunners.keys()]).toEqual([3]);
        const body = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
            .body as URLSearchParams;
        expect(body.get('seed')).toBe('4');

        // A new track of a page without seed
        const other = createCourse(5);
        expect(GhostService.canRace(other.track)).toBe(false);
        await GhostService.toggleGhost(other.track, 3);
        expect(other.track.ghostRunners.size).toBe(0);
        expect(GhostService.canRace(new Track(null))).toBe(true);
    });
});

describe('Endurance run', () => {
    test('counts the distance, then ends when the rider falls into a gap', () => {
        const course = createCourse(4);
        const records = new EnduranceRecords(memoryStorage());
        const run = new EnduranceRun(course, records);
        const track = course.track;
        const runner = track.playerRunner;

        pressKey('up');
        for (let tick = 0; tick < 100; tick++) {
            tickRace(track);
            run.update();
        }
        releaseKey('up');
        expect(run.over).toBe(false);
        expect(run.distance).toBeGreaterThan(5);
        expect(run.time).toBe(100);

        // Into the void: far under the ground
        const bike = runner.instance;
        if (!bike) throw new Error('No bike');
        bike.points.forEach((point) => point.pos.selfAdd({ x: 0, y: 2000 } as never));
        run.update();

        expect(runner.dead).toBe(true);
        expect(run.result).toEqual({ distance: run.distance, time: 100, seed: 4, version: 1 });
        expect(run.ghostString).toMatch(/,100,BMX$/);
        expect(run.beaten).toEqual({ overall: true, track: true });
        expect(records.best).toEqual(run.result);

        // Restarting starts a new run, on the same track
        track.restart();
        run.update();
        expect(run.over).toBe(false);
        expect(run.distance).toBe(0);
    });

    test('ends when an invincible rider falls into a gap', () => {
        const course = createCourse(4);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        const runner = course.track.playerRunner;
        run.update();

        runner.modifiersMask |= MODIFIERS.INVINCIBILITY;
        runner.instance?.points.forEach((point) => point.pos.selfAdd({ x: 0, y: 2000 } as never));
        run.update();

        expect(run.over).toBe(true);
    });

    test('ends when the bike explodes on a bomb', () => {
        const course = createCourse(4);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        const runner = course.track.playerRunner;
        run.update();

        runner.explode(
            runner.instance?.hitbox.pos.clone() ?? (null as never),
            runner.instance?.hitbox.velocity.clone() ?? (null as never),
        );
        run.update();

        expect(run.over).toBe(true);
    });

    test('plays the same with ghosts racing, whatever they do', () => {
        const ride = (ghostString: string | null) => {
            const course = createCourse(9);
            const track = course.track;
            if (ghostString !== null) {
                const ghost = new GhostRunner(track, ghostString, false);
                ghost.createBike();
                track.ghostRunners.set(1, ghost);
                track.restart();
            }
            const run = rideUntilFall(course);
            return [run.distance, run.time, track.playerRunner.instance?.hitbox.pos.x];
        };

        const alone = ride(null);
        expect(alone[1]).toBeGreaterThan(100);
        // A ghost braking at the start, and one on another bike riding further
        expect(ride('0,0,,,,4000,BMX')).toEqual(alone);
        expect(ride('0,,,,,4000,MTB')).toEqual(alone);
    });

    test('is retired while riding, its ghost and the verifier retiring where it was ridden', () => {
        const course = createCourse(9);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        pressKey('up');
        for (let tick = 0; tick < 150; tick++) {
            tickRace(course.track);
            run.update();
        }
        releaseKey('up');
        expect(run.over).toBe(false);

        expect(run.retire()).toBe(true);
        expect(run.retire()).toBe(false);
        expect([run.over, run.retired]).toEqual([true, true]);
        expect(run.distance).toBeGreaterThan(5);
        expect(run.result).toMatchObject({ distance: run.distance, time: run.time });
        // The rider falls off, as when crashing
        expect(course.track.playerRunner.dead).toBe(true);

        // The backend replays the run alive until its end, retired there
        const ghostString = run.ghostString ?? '';
        const limits = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };
        expect(GhostVerifier.verifyEndurance(9, 1, ghostString, run.time, limits)).toEqual({
            valid: true,
            reason: '',
            distance: run.distance,
            retired: true,
        });

        // Its ghost retires where it was ridden
        const replay = createCourse(9);
        const ghost = new GhostRunner(replay.track, ghostString, false);
        ghost.createBike();
        replay.track.ghostRunners.set(1, ghost);
        for (let tick = 0; tick < 1000 && !replay.riderOf(ghost)?.over; tick++) {
            tickRace(replay.track);
            replay.step();
        }
        expect(replay.riderOf(ghost)).toMatchObject({
            over: true,
            retired: true,
            distance: run.distance,
            time: run.time,
        });

        // As a rider of a live session, told they retired
        const live = createCourse(9);
        const remote = new RemoteRunner(live.track, 'Rider');
        live.track.remoteRunners.set('rider', remote);
        const { keys } = GhostParser.parse(ghostString);
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            ...[...keys].flatMap(([control, times]) =>
                [...times].map((time) => ({ type: 'toggle' as const, time, control })),
            ),
            { type: 'progress', time: run.time },
            { type: 'retire', time: run.time },
        ]);
        for (let tick = 0; tick < 1000 && !live.riderOf(remote)?.over; tick++) {
            remote.advance();
        }
        expect(live.riderOf(remote)).toMatchObject({
            retired: true,
            distance: run.distance,
            time: run.time,
        });
    });

    test('is replayed by the verifier of the backend from its seed', () => {
        const run = rideUntilFall(createCourse(9));
        const ghostString = run.ghostString ?? '';
        const limits = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };

        expect(GhostVerifier.verifyEndurance(9, 1, ghostString, run.time, limits)).toEqual({
            valid: true,
            reason: '',
            distance: run.distance,
            retired: false,
        });
        // Another track, or a time claimed apart from the run
        expect(GhostVerifier.verifyEndurance(10, 1, ghostString, run.time, limits).valid).toBe(
            false,
        );
        const forged = ghostString.replace(/,[0-9]+,BMX$/, `,${run.time + 50},BMX`);
        expect(GhostVerifier.verifyEndurance(9, 1, forged, run.time + 50, limits)).toMatchObject({
            valid: false,
            reason: `The rider falls at another time: tick ${run.time}`,
        });
    });

    test('plays the same for the same seed and inputs', () => {
        const ride = () => {
            const course = createCourse(9);
            const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
            const runner = course.track.playerRunner;
            pressKey('up');
            for (let tick = 0; tick < 400 && !run.over; tick++) {
                tickRace(course.track);
                run.update();
            }
            releaseKey('up');
            return [run.distance, run.time, runner.instance?.hitbox.pos.x];
        };

        expect(ride()).toEqual(ride());
    });
});

describe('Endurance records', () => {
    test('keep the furthest run, the fastest one for the same distance', () => {
        const storage = memoryStorage();
        const records = new EnduranceRecords(storage);

        expect(records.submit({ distance: 100.4, time: 900, seed: 1 })).toEqual({
            overall: true,
            track: true,
        });
        // As far in whole meters, but slower: no record
        expect(records.submit({ distance: 100.9, time: 950, seed: 1 }).overall).toBe(false);
        // As far and faster
        expect(records.submit({ distance: 100.2, time: 800, seed: 1 }).overall).toBe(true);
        // Shorter, but on another track: its record only
        expect(records.submit({ distance: 50, time: 400, seed: 2 })).toEqual({
            overall: false,
            track: true,
        });

        const reloaded = new EnduranceRecords(storage);
        expect(reloaded.best).toEqual({ distance: 100.2, time: 800, seed: 1 });
        expect(reloaded.bestOn(2)?.distance).toBe(50);
        expect(reloaded.bestOn(3)).toBeNull();
    });

    test('last until the page is closed without storage', () => {
        const records = new EnduranceRecords(null);
        records.submit({ distance: 10, time: 100, seed: 1 });

        expect(records.best?.distance).toBe(10);
    });
});

describe('Endurance configuration', () => {
    const host = (dataset: Record<string, string> = {}) => ({ dataset }) as unknown as HTMLElement;

    test('reads the mode and the seed of the host element, else of the page URL', () => {
        GameConfig.configure(host(), '');
        expect(GameConfig.mode).toBe('tracks');
        expect(GameConfig.seed).toBeNull();

        GameConfig.configure(host(), '?mode=endurance&seed=1234');
        expect(GameConfig.mode).toBe('endurance');
        expect(GameConfig.seed).toBe(1234);

        GameConfig.configure(host({ gameMode: 'endurance', seed: '77' }), '?seed=1234');
        expect(GameConfig.seed).toBe(77);

        GameConfig.configure(host(), '?mode=endurance&seed=-3');
        expect(GameConfig.seed).toBeNull();
    });
});

describe('Endurance leaderboard', () => {
    /** Response double of the backend. */
    function response(status: number, body: unknown): Response {
        return {
            ok: status < 400,
            status,
            statusText: '',
            json: () => Promise.resolve(body),
        } as Response;
    }

    test('is configured by the host element, on the track of its seed', () => {
        const host = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

        GameConfig.configure(host({ seed: '42', enduranceSave: '1', enduranceBest: '120.5,900' }));
        expect(GameConfig.enduranceSave).toBe(true);
        expect(GameConfig.enduranceBest).toEqual({ distance: 120.5, time: 900 });

        GameConfig.configure(host({ enduranceSave: '1' }));
        expect(GameConfig.enduranceSave).toBe(false);
        expect(GameConfig.enduranceBest).toBeNull();
    });

    test('races the ghosts of the host element from the start, else the ones of the page URL', () => {
        const host = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

        GameConfig.configure(host({ ghosts: '3,abc,-1,5' }), '?ghosts=8');
        expect(GameConfig.ghostIds).toEqual([3, 5]);
        GameConfig.configure(host({}), '?ghosts=8');
        expect(GameConfig.ghostIds).toEqual([8]);
        GameConfig.configure(host({}));
        expect(GameConfig.ghostIds).toEqual([]);
    });

    test('gets the runs of its track beating the best one uploaded', () => {
        GameConfig.enduranceSave = true;
        GameConfig.seed = 9;
        GameConfig.enduranceBest = { distance: 50.2, time: 800 };

        expect(EnduranceService.shouldSave({ distance: 51, time: 2000, seed: 9 })).toBe(true);
        expect(EnduranceService.shouldSave({ distance: 50.9, time: 700, seed: 9 })).toBe(true);
        expect(EnduranceService.shouldSave({ distance: 50.9, time: 900, seed: 9 })).toBe(false);
        expect(EnduranceService.shouldSave({ distance: 80, time: 900, seed: 10 })).toBe(false);
        GameConfig.enduranceSave = false;
        expect(EnduranceService.shouldSave({ distance: 80, time: 900, seed: 9 })).toBe(false);
    });

    test('uploads a run once over, telling its rank, or why it was refused', async () => {
        GameConfig.enduranceSave = true;
        GameConfig.seed = 9;
        const fetch = vi.fn(() => Promise.resolve(response(200, { ID: 7, RANK: 2 })));
        vi.stubGlobal('fetch', fetch);
        const run = rideUntilFall(createCourse(9));

        await EnduranceService.saveRun(run);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        const body = init.body as URLSearchParams;
        expect(url).toBe('./backend/db/enduranceupload/');
        expect(body.get('seed')).toBe('9');
        expect(body.get('ghostString')).toBe(run.ghostString);
        expect(body.get('time')).toBe(String(run.time));
        expect(run.upload).toEqual({ state: 'saved', rank: 2 });
        expect(GameConfig.enduranceBest).toEqual({ distance: run.distance, time: run.time });
        expect(document.dispatchEvent).toHaveBeenCalled();

        fetch.mockImplementation(() =>
            Promise.resolve(response(422, { error: 'The run does not match its track' })),
        );
        await EnduranceService.saveRun(run);
        expect(run.upload).toEqual({
            state: 'refused',
            reason: 'The run does not match its track',
        });
    });
});
