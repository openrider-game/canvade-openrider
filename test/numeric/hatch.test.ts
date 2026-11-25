import { Vector } from 'canvade';
import { describe, expect, test } from 'vitest';
import { hatch, HatchOptions, HatchSegment } from '../../src/openrider/numeric/hatch';

const square = [new Vector(0, 0), new Vector(100, 0), new Vector(100, 100), new Vector(0, 100)];
const options = (changes: Partial<HatchOptions> = {}): HatchOptions => ({
    angle: 0,
    spacing: 20,
    pattern: 'parallel',
    maxSegments: 1000,
    ...changes,
});

/**
 * Segments rounded to hundredths, as `[x1, y1, x2, y2]`, each from its smallest end, sorted by y
 * then x: their order does not matter.
 */
const rounded = (segments: HatchSegment[]) =>
    segments
        .map((segment) => {
            const [a, b] = [...segment].sort((p, q) => p.x - q.x || p.y - q.y);
            return [a.x, a.y, b.x, b.y].map((value) => Math.round(value * 100) / 100 || 0);
        })
        .sort((p, q) => p[1] - q[1] || p[0] - q[0]);

describe('hatch', () => {
    test('fills a square with horizontal lines at whole multiples of the spacing, inside it', () => {
        const { segments, overflow } = hatch(square, options());
        expect(overflow).toBe(false);
        // Not on its edges y = 0 and 100: they are its outline
        expect(rounded(segments)).toEqual([20, 40, 60, 80].map((y) => [0, y, 100, y]));
    });

    test('lines up the hatches of areas side by side, whatever their position', () => {
        const shifted = square.map((p) => p.add(new Vector(7, 3)));
        const ys = rounded(hatch(shifted, options()).segments).map(([, y]) => y);
        expect(ys).toEqual([20, 40, 60, 80, 100]);
    });

    test('turns the lines by the angle, clockwise on screen', () => {
        const vertical = rounded(hatch(square, options({ angle: 90 })).segments).sort(
            (p, q) => p[0] - q[0],
        );
        expect(vertical).toEqual([20, 40, 60, 80].map((x) => [x, 0, x, 100]));

        // At 45 degrees, every line goes down to the right and stays in the square
        const diagonal = hatch(square, options({ angle: 45 })).segments;
        expect(diagonal.length).toBeGreaterThan(5);
        for (const [a, b] of diagonal) {
            expect(b.y - a.y).toBeCloseTo(b.x - a.x);
            for (const p of [a, b]) {
                expect(p.x).toBeGreaterThanOrEqual(-1e-9);
                expect(p.x).toBeLessThanOrEqual(100 + 1e-9);
                expect(p.y).toBeGreaterThanOrEqual(-1e-9);
                expect(p.y).toBeLessThanOrEqual(100 + 1e-9);
            }
        }
    });

    test('crosses the lines with perpendicular ones', () => {
        const { segments } = hatch(square, options({ pattern: 'cross' }));
        expect(segments).toHaveLength(8);
        // The perpendicular lines come second
        const columns = rounded(segments.slice(4)).sort((p, q) => p[0] - q[0]);
        expect(columns).toEqual([20, 40, 60, 80].map((x) => [x, 0, x, 100]));
    });

    test('splits the lines crossing a concave area, leaving its notch empty', () => {
        // A U: two arms from x 0 to 30 and 70 to 100, joined at the bottom from y 70
        const u = [
            new Vector(0, 0),
            new Vector(30, 0),
            new Vector(30, 70),
            new Vector(70, 70),
            new Vector(70, 0),
            new Vector(100, 0),
            new Vector(100, 100),
            new Vector(0, 100),
        ];
        const lines = rounded(hatch(u, options()).segments);
        expect(lines).toEqual([
            [0, 20, 30, 20],
            [70, 20, 100, 20],
            [0, 40, 30, 40],
            [70, 40, 100, 40],
            [0, 60, 30, 60],
            [70, 60, 100, 60],
            [0, 80, 100, 80],
        ]);
    });

    test('keeps the hole of an area crossing itself, by the even-odd rule', () => {
        // A frame drawn in one go: the outside square, then the inside one, joined by a seam
        const frame = [
            new Vector(0, 0),
            new Vector(100, 0),
            new Vector(100, 100),
            new Vector(0, 100),
            new Vector(0, 0),
            new Vector(30, 30),
            new Vector(30, 70),
            new Vector(70, 70),
            new Vector(70, 30),
            new Vector(30, 30),
        ];
        const row40 = rounded(hatch(frame, options()).segments).filter(([, y]) => y === 40);
        expect(row40).toEqual([
            [0, 40, 30, 40],
            [70, 40, 100, 40],
        ]);
    });

    test('tells it overflows instead of making more segments than allowed', () => {
        expect(hatch(square, options({ maxSegments: 4 })).overflow).toBe(false);
        expect(hatch(square, options({ maxSegments: 3 }))).toEqual({
            segments: [],
            overflow: true,
        });
        // Counted over both directions of a crossed pattern
        expect(hatch(square, options({ pattern: 'cross', maxSegments: 7 })).overflow).toBe(true);
        // Stops early for a huge area
        const huge = square.map((p) => p.scale(1e6));
        expect(hatch(huge, options({ spacing: 1, maxSegments: 2000 })).overflow).toBe(true);
    });

    test('never doubles an edge of a turned area, whatever the angle', () => {
        // A diamond: its edges at 45 degrees, on rows of a 45 degree hatch
        const diamond = [
            new Vector(0, -100),
            new Vector(100, 0),
            new Vector(0, 100),
            new Vector(-100, 0),
        ];
        for (const angle of [45, 135]) {
            const { segments } = hatch(diamond, options({ angle, spacing: 100 / Math.SQRT2 }));
            // The middle row only: the rows on the 4 edges are outline
            expect(segments).toHaveLength(1);
        }
    });

    test('fills nothing without an area or a spacing', () => {
        expect(hatch(square.slice(0, 2), options()).segments).toEqual([]);
        expect(hatch(square, options({ spacing: 0 })).segments).toEqual([]);
    });
});
