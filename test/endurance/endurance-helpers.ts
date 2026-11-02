import { Vector } from 'canvade';
import { afterEach, beforeEach, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import { EnduranceRecords } from '../../src/openrider/endurance/endurance-records';
import { EnduranceRun } from '../../src/openrider/endurance/endurance-run';
import { LATEST_GENERATOR_VERSION } from '../../src/openrider/endurance/terrain/versions';
import { TerrainGenerator } from '../../src/openrider/endurance/terrain-generator';
import { Track } from '../../src/openrider/track/track';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { pressKey, releaseKey } from '../helpers/track';

/** Endurance tracks, courses and runs of the tests of the endurance mode. */

/** Storage double, as the one of the browser. */
export function memoryStorage(): Storage {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
}

/**
 * A new endurance track with its course and the bike of the player, on version 1 of the
 * generator by default: the distances and falls of the tests are those of its tracks.
 */
export function createCourse(seed: number, version = 1): EnduranceCourse {
    const track = new Track(null);
    track.canvas = createCanvasMock().canvas;
    const course = new EnduranceCourse(track, seed, version);
    track.playerRunner.createBike();
    return course;
}

/**
 * Moves the bike of a runner to a position along the course, above the fall limit there: only
 * for the loading of the sections, the bike being anywhere in the terrain.
 */
export function moveBike(course: EnduranceCourse, runner: BikeRunner, x: number): void {
    const bike = runner.instance;
    if (!bike) throw new Error('No bike');
    const shift = new Vector(x, course.fallLimitAt(x) - 500).sub(bike.hitbox.pos);
    bike.points.forEach((point) => point.pos.selfAdd(shift));
}

/** Runs a physics tick of the runners, as the play states do. */
export function tickRace(track: Track): void {
    track.playerRunner.fixedUpdate();
    track.ghostRunners.forEach((ghost) => ghost.fixedUpdate());
}

/** Rides holding the up key until the rider falls, returning the run of the player. */
export function rideUntilFall(course: EnduranceCourse, maxTicks = 6000): EnduranceRun {
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
export function gaps(generator: TerrainGenerator, sections: number[]): number[] {
    const polylines = sections.flatMap((index) => generator.section(index).solid);
    return polylines.slice(1).map((points, i) => {
        const previous = polylines[i];
        return points[0][0] - previous[previous.length - 1][0];
    });
}

/** Registers the hooks of the tests using these helpers, called at the top of each file. */
export function useEnduranceTests(): void {
    beforeEach(() => {
        stubBrowser();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        GameConfig.mode = 'tracks';
        GameConfig.seed = null;
        GameConfig.version = LATEST_GENERATOR_VERSION;
        GameConfig.enduranceSave = false;
        GameConfig.enduranceBest = null;
    });
}
