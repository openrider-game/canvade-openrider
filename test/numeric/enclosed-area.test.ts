import { Vector } from 'canvade';
import { describe, expect, test } from 'vitest';
import {
    EnclosedArea,
    findEnclosedArea,
    hatchEnclosed,
} from '../../src/openrider/numeric/enclosed-area';
import { HatchOptions, HatchSegment } from '../../src/openrider/numeric/hatch';

/** Lines joining points in order, closed from the last to the first. */
const loop = (...points: [number, number][]): HatchSegment[] =>
    points.map(([x, y], i) => {
        const [nx, ny] = points[(i + 1) % points.length];
        return [new Vector(x, y), new Vector(nx, ny)];
    });

const window = { min: new Vector(-200, -200), max: new Vector(300, 300) };
const options = (changes: Partial<HatchOptions> = {}): HatchOptions => ({
    angle: 0,
    spacing: 20,
    pattern: 'parallel',
    maxSegments: 1000,
    ...changes,
});

/** The area around a point, failing the test when there is none. */
const areaAt = (walls: HatchSegment[], x: number, y: number, cell = 2): EnclosedArea => {
    const area = findEnclosedArea(walls, new Vector(x, y), window, cell);
    if (typeof area === 'string') {
        throw new Error(`No area: ${area}`);
    }
    return area;
};

/** Segments rounded to hundredths, as `[x1, y1, x2, y2]` from their leftmost end, sorted. */
const rounded = (segments: HatchSegment[]) =>
    segments
        .map((segment) => {
            const [a, b] = [...segment].sort((p, q) => p.x - q.x || p.y - q.y);
            return [a.x, a.y, b.x, b.y].map((value) => Math.round(value * 100) / 100 || 0);
        })
        .sort((p, q) => p[1] - q[1] || p[0] - q[0]);

const square = loop([0, 0], [100, 0], [100, 100], [0, 100]);

describe('findEnclosedArea', () => {
    test('finds the area closed by lines around a point', () => {
        const area = areaAt(square, 50, 50);
        // The cells inside, between the cells of the lines
        expect(area.inside.minColumn * area.cell + area.origin.x).toBeGreaterThan(0);
        expect((area.inside.maxColumn + 1) * area.cell + area.origin.x).toBeLessThanOrEqual(100);
    });

    test('tells a point on a line, or out of any closed area', () => {
        expect(findEnclosedArea(square, new Vector(100, 50), window, 2)).toBe('on-line');
        expect(findEnclosedArea(square, new Vector(150, 50), window, 2)).toBe('open');
        // Open by a gap wider than a cell
        const gap = loop([0, 0], [100, 0], [100, 100], [0, 100]).slice(0, 3);
        gap.push([new Vector(0, 100), new Vector(0, 60)], [new Vector(0, 40), new Vector(0, 0)]);
        expect(findEnclosedArea(gap, new Vector(50, 50), window, 2)).toBe('open');
        // Out of the window
        expect(findEnclosedArea(square, new Vector(1000, 50), window, 2)).toBe('open');
    });

    test('closes a gap narrower than a cell', () => {
        const walls = square.slice(0, 3);
        walls.push([new Vector(0, 100), new Vector(0, 51)], [new Vector(0, 50), new Vector(0, 0)]);
        expect(typeof findEnclosedArea(walls, new Vector(50, 50), window, 4)).toBe('object');
    });

    test('is blocked by diagonal lines too', () => {
        const diamond = loop([50, 0], [100, 50], [50, 100], [0, 50]);
        const area = areaAt(diamond, 50, 50);
        expect(area.inside.minColumn * area.cell + area.origin.x).toBeGreaterThan(0);
    });

    test('grows its cells past the most cells', () => {
        const huge = { min: new Vector(-1e6, -1e6), max: new Vector(1e6, 1e6) };
        const area = findEnclosedArea(
            loop([0, 0], [1e5, 0], [1e5, 1e5], [0, 1e5]),
            new Vector(5e4, 5e4),
            huge,
            1,
        );
        expect(typeof area).toBe('object');
        expect((area as EnclosedArea).cells.length).toBeLessThanOrEqual(4_000_000 + 4000);
    });
});

describe('hatchEnclosed', () => {
    test('fills the area with lines ending exactly on its lines', () => {
        const { segments, overflow } = hatchEnclosed(areaAt(square, 50, 50), square, options());
        expect(overflow).toBe(false);
        // Not on the lines y = 0 and 100: they are the outline
        expect(rounded(segments)).toEqual([20, 40, 60, 80].map((y) => [0, y, 100, y]));
    });

    test('follows a shape of any lines, at an angle', () => {
        const triangle = loop([0, 0], [100, 0], [0, 100]);
        const { segments } = hatchEnclosed(
            areaAt(triangle, 20, 20),
            triangle,
            options({ angle: 90 }),
        );
        // Columns from the top to the diagonal x + y = 100
        expect(rounded(segments)).toEqual([20, 40, 60, 80].map((x) => [x, 0, x, 100 - x]));
    });

    test('leaves an island out, and fills the island alone when clicked in it', () => {
        const island = loop([40, 40], [60, 40], [60, 60], [40, 60]);
        const walls = [...square, ...island];
        const around = rounded(
            hatchEnclosed(areaAt(walls, 10, 10), walls, options({ spacing: 10 })).segments,
        );
        expect(around.filter(([, y]) => y === 50)).toEqual([
            [0, 50, 40, 50],
            [60, 50, 100, 50],
        ]);
        const inside = rounded(
            hatchEnclosed(areaAt(walls, 50, 45), walls, options({ spacing: 10 })).segments,
        );
        expect(inside).toEqual([[40, 50, 60, 50]]);
    });

    test('stops at the closed gap, without running out through it', () => {
        // A gap of 1 unit on the left side, at y 50, closed by cells of 4
        const walls = square.slice(0, 3);
        walls.push(
            [new Vector(0, 100), new Vector(0, 50.5)],
            [new Vector(0, 49.5), new Vector(0, 0)],
        );
        const area = areaAt(walls, 50, 30, 4);
        const row50 = rounded(hatchEnclosed(area, walls, options({ spacing: 50 })).segments);
        expect(row50).toHaveLength(1);
        // From near the gap to the right side, never far out to the left
        expect(row50[0][0]).toBeGreaterThanOrEqual(-4);
        expect(row50[0][0]).toBeLessThanOrEqual(4);
        expect(row50[0][2]).toBe(100);
    });

    test('crosses the lines, and tells it overflows', () => {
        const area = areaAt(square, 50, 50);
        expect(hatchEnclosed(area, square, options({ pattern: 'cross' })).segments).toHaveLength(8);
        expect(hatchEnclosed(area, square, options({ maxSegments: 3 }))).toEqual({
            segments: [],
            overflow: true,
        });
    });
});
