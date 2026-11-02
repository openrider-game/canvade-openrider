import { describe, expect, test } from 'vitest';
import {
    DIFFICULTY_DISTANCE,
    POST_SPACING,
    SECTION_LENGTH,
} from '../../src/openrider/endurance/endurance.constants';
import { SeededRandom } from '../../src/openrider/endurance/seeded-random';
import {
    BIOME_DECORATIONS,
    decorateSection,
} from '../../src/openrider/endurance/decoration/decorate';
import { DecorFactory } from '../../src/openrider/endurance/decoration/decor-factory';
import { generatorVersion } from '../../src/openrider/endurance/terrain/versions';
import { TerrainGenerator } from '../../src/openrider/endurance/terrain-generator';
import { Point, TrackSection } from '../../src/openrider/endurance/terrain.types';
import { gaps, useEnduranceTests } from './endurance-helpers';

useEnduranceTests();

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
