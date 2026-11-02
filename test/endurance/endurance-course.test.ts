import { describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { RemoteRunner } from '../../src/openrider/bike/runner/remote-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import {
    BACK_LIMIT,
    LOADED_AHEAD,
    LOADED_BEHIND,
    SECTION_LENGTH,
    UNITS_PER_METER,
} from '../../src/openrider/endurance/endurance.constants';
import { GhostService } from '../../src/openrider/request/ghost-service';
import { Track } from '../../src/openrider/track/track';
import { createCourse, moveBike, useEnduranceTests } from './endurance-helpers';

useEnduranceTests();

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
                .map(([key, cell]): [number | string, number[]] => [
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
        GameConfig.version = 1;
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
