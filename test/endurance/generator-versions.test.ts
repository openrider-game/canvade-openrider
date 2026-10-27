import { afterEach, describe, expect, test, vi } from 'vitest';
import siteController from '../../backend/local/site/src/controllers/endurance.php?raw';
import { GameConfig } from '../../src/openrider/config/game-config';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import { EnduranceRecords } from '../../src/openrider/endurance/endurance-records';
import {
    DRAFT_GENERATOR_VERSION,
    generatorVersion,
    isGeneratorVersion,
    LATEST_GENERATOR_VERSION,
} from '../../src/openrider/endurance/terrain/versions';
import { TerrainGenerator } from '../../src/openrider/endurance/terrain-generator';
import { EnduranceService } from '../../src/openrider/request/endurance-service';
import { GhostService } from '../../src/openrider/request/ghost-service';
import { Track } from '../../src/openrider/track/track';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { stubBrowser } from '../helpers/canvas';

/** Storage double, as the one of the browser. */
function memoryStorage(): Storage {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
}

/** FNV-1a hash of a text, as 8 hexadecimal digits: a short fingerprint of generated tracks. */
function fingerprint(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/** The first sections of the track of a seed, on a version of the generator. */
function sections(seed: number, version: number, count = 120): string {
    const generator = new TerrainGenerator(seed, 0, 0, version);
    return JSON.stringify(Array.from({ length: count }, (_, index) => generator.section(index)));
}

afterEach(() => {
    vi.unstubAllGlobals();
    GameConfig.seed = null;
    GameConfig.version = LATEST_GENERATOR_VERSION;
    GameConfig.enduranceSave = false;
});

describe('Generator versions', () => {
    test('never change the tracks they generate', () => {
        // The tracks of a released version, which the saved runs replay on: a failure means that
        // an obstacle or a zone of the version changed, or their order, instead of going into a
        // new version
        expect({
            1: [1, 42, 123456, 4294967295].map((seed) => fingerprint(sections(seed, 1))),
            2: [1, 42, 123456, 4294967295].map((seed) => fingerprint(sections(seed, 2))),
        }).toMatchSnapshot();
    });

    test('list each obstacle, zone and biome once, and are all known to the game', () => {
        // The released versions, then the one in development if any
        const last = DRAFT_GENERATOR_VERSION ?? LATEST_GENERATOR_VERSION;
        expect(last).toBeGreaterThanOrEqual(LATEST_GENERATOR_VERSION);
        for (let version = 1; version <= last; version++) {
            const { obstacles, zones, biomes = [] } = generatorVersion(version);
            const names = [...obstacles, ...zones].map((choice) => choice.name);
            expect(new Set(names).size).toBe(names.length);
            expect(new Set(biomes.map((biome) => biome.name)).size).toBe(biomes.length);

            // The biomes only change the obstacles and zones of their version
            for (const biome of biomes) {
                for (const name of Object.keys(biome.obstacles)) {
                    expect(obstacles.map((obstacle) => obstacle.name)).toContain(name);
                }
                for (const name of Object.keys(biome.zones)) {
                    expect(zones.map((zone) => zone.name)).toContain(name);
                }
            }
        }
        expect(isGeneratorVersion(LATEST_GENERATOR_VERSION)).toBe(true);
        expect(isGeneratorVersion(last + 1)).toBe(false);
        expect(() => new TerrainGenerator(1, 0, 0, 999)).toThrow('Unknown version');
    });

    test('released by the website are all versions of the game', () => {
        const list = /SITE_ENDURANCE_VERSIONS = \[([^\]]*)\]/.exec(siteController)?.[1] ?? '';
        const versions = [...list.matchAll(/(\d+)\s*=>/g)].map((match) => Number(match[1]));

        expect(versions).toContain(1);
        for (const version of versions) {
            expect(isGeneratorVersion(version)).toBe(true);
        }
    });

    test('are read from the host element, an unknown one riding the latest without saving', () => {
        const host = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

        GameConfig.configure(host({ seed: '5', version: '1', enduranceSave: '1' }));
        expect([GameConfig.version, GameConfig.enduranceSave]).toEqual([1, true]);
        GameConfig.configure(host({ seed: '5', enduranceSave: '1' }), '?version=1');
        expect(GameConfig.version).toBe(1);
        GameConfig.configure(host({ seed: '5', version: '999', enduranceSave: '1' }));
        expect([GameConfig.version, GameConfig.enduranceSave]).toEqual([
            LATEST_GENERATOR_VERSION,
            false,
        ]);
    });

    test('keep the records of each version apart, the first one as before the versions', () => {
        const records = new EnduranceRecords(memoryStorage());

        records.submit({ distance: 50, time: 900, seed: 7 });
        records.submit({ distance: 80, time: 900, seed: 7, version: 2 });

        expect(records.bestOn(7)?.distance).toBe(50);
        expect(records.bestOn(7, 1)?.distance).toBe(50);
        expect(records.bestOn(7, 2)?.distance).toBe(80);
    });

    test('only save and race the runs of the version of the page', () => {
        stubBrowser();
        GameConfig.enduranceSave = true;
        GameConfig.seed = 9;
        GameConfig.version = 1;
        const track = new Track(null);
        const course = new EnduranceCourse(track, 9, 1);

        expect(course.version).toBe(1);
        expect(EnduranceService.shouldSave({ distance: 10, time: 100, seed: 9, version: 1 })).toBe(
            true,
        );
        expect(EnduranceService.shouldSave({ distance: 10, time: 100, seed: 9, version: 2 })).toBe(
            false,
        );
        expect(GhostService.canRace(track)).toBe(true);
        GameConfig.version = 2;
        expect(GhostService.canRace(track)).toBe(false);
    });

    test('are replayed by the verifier, which refuses the unknown ones', () => {
        const limits = { maxTicks: 1000, deadline: Number.MAX_SAFE_INTEGER };

        expect(() => GhostVerifier.verifyEndurance(9, 999, '0,,,,,100,BMX', 100, limits)).toThrow(
            'Unknown version',
        );
    });
});
