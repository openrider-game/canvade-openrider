import { Vector } from 'canvade';
import { afterEach, describe, expect, test } from 'vitest';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { ShapeGroupTool } from '../../src/openrider/tool/group/group.tools';
import { FillTool, MAX_FILL_LINES } from '../../src/openrider/tool/shape/fill.tool';
import { SCENERY_FILL_ICON, SOLID_FILL_ICON } from '../../src/openrider/tool/tool-icons';
import { keyEvent, moveMouse } from '../helpers/track';
import { click, drag, select, solidLines, track, useToolTrack } from './tool-helpers';

useToolTrack();
afterEach(() => FillTool.resetChoices());

const sceneryLines = () => [...track.layers.main[0].grid.totalSceneryLines.values()];

/** The lines on the track as `[x1, y1, x2, y2]`, sorted. */
const lineEnds = () =>
    solidLines()
        .map((line) => [line.pos.x, line.pos.y, line.endPos.x, line.endPos.y])
        .sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[3] - b[3]);

/** Label of an option of the tool, found by its start. */
const option = (tool: FillTool, start: string) =>
    tool.getOptions().find((o) => o.label.startsWith(start))!;

/** Clicks the corners of a polygon, without closing it. */
const corners = (...points: [number, number][]) => points.forEach(([x, y]) => click(x, y));

describe('Fill tool', () => {
    test('is in the shape group, its icon showing the kind of lines', () => {
        expect(ShapeGroupTool.toolClasses).toContain(FillTool);
        const fill = select(FillTool);
        expect(fill.getIcon()).toBe(SOLID_FILL_ICON);
        fill.getOptions()[0].action!();
        expect(fill.getIcon()).toBe(SCENERY_FILL_ICON);
    });

    test('fills a polygon clicked corner by corner, closed on its first corner, undone at once', () => {
        const fill = select(FillTool);
        FillTool.angle = 0;
        expect(option(fill, 'Next').label).toBe('Next: click its corners');

        corners([0, 0], [100, 0], [100, 100]);
        expect(option(fill, '3 corners')).toBeDefined();
        expect(solidLines()).toHaveLength(0);
        corners([0, 100], [0, 0]);

        expect(lineEnds()).toEqual([20, 40, 60, 80].map((y) => [0, y, 100, y]));
        expect(option(fill, 'Next').label).toBe('Next: click its corners');
        track.history.undo();
        expect(solidLines()).toHaveLength(0);
        track.history.redo();
        expect(solidLines()).toHaveLength(4);
    });

    test('closes the polygon with Enter or the Fill option, Backspace and Escape editing it', () => {
        const fill = select(FillTool);
        FillTool.angle = 0;

        corners([0, 0], [100, 0], [50, 50]);
        expect(fill.onKeyDown(keyEvent('Backspace', 'Backspace'))).toBe(true);
        expect(option(fill, '2 corners')).toBeDefined();
        expect(option(fill, 'Fill')).toBeUndefined();
        // Not closed with 2 corners
        fill.onKeyDown(keyEvent('Enter', 'Enter'));
        expect(solidLines()).toHaveLength(0);

        corners([100, 100]);
        fill.onKeyDown(keyEvent('Escape', 'Escape'));
        expect(option(fill, 'Next').label).toBe('Next: click its corners');
        expect(fill.onKeyDown(keyEvent('Escape', 'Escape'))).toBe(false);

        corners([0, 0], [100, 0], [100, 100]);
        fill.onKeyDown(keyEvent('Enter', 'Enter'));
        // A triangle: shorter lines going down
        expect(lineEnds()).toEqual([20, 40, 60, 80].map((y) => [y, y, 100, y]));

        corners([200, 0], [300, 0], [300, 100]);
        option(fill, 'Fill').action!();
        expect(solidLines()).toHaveLength(8);
    });

    test('fills a rectangle dragged, with crossed lines and its outline once chosen', () => {
        const fill = select(FillTool);
        option(fill, 'Area').action!();
        option(fill, 'Pattern').action!();
        option(fill, 'Outline').action!();
        FillTool.angle = 0;
        expect(option(fill, 'Area').label).toBe('Area: rectangle');
        expect(option(fill, 'Pattern').label).toBe('Pattern: crossed');

        // A click fills nothing
        click(10, 10);
        expect(solidLines()).toHaveLength(0);

        drag(new Vector(100, 100), new Vector(0, 0));
        // 4 rows, 4 columns and the 4 sides, no row doubling a side
        expect(solidLines()).toHaveLength(12);
        expect(lineEnds()).toContainEqual([100, 100, 0, 100]);
        track.history.undo();
        expect(solidLines()).toHaveLength(0);
    });

    test('steps the spacing and the angle, kept for the next use', () => {
        const fill = select(FillTool);
        expect(option(fill, 'Spacing').label).toBe('Spacing: 20');
        option(fill, 'Spacing').steps!.up();
        expect(option(fill, 'Spacing').label).toBe('Spacing: 30');
        option(fill, 'Spacing').steps!.down();
        option(fill, 'Spacing').steps!.down();
        expect(option(fill, 'Spacing').label).toBe('Spacing: 15');

        expect(option(fill, 'Angle').label).toBe('Angle: 45°');
        option(fill, 'Angle').steps!.down();
        option(fill, 'Angle').steps!.down();
        option(fill, 'Angle').steps!.down();
        option(fill, 'Angle').steps!.down();
        expect(option(fill, 'Angle').label).toBe('Angle: 165°');
        option(fill, 'Angle').action!();
        expect(option(fill, 'Angle').label).toBe('Angle: 0°');

        expect(option(select(FillTool), 'Spacing').label).toBe('Spacing: 15');
    });

    test('draws scenery lines in the color chosen, with lines at an angle', () => {
        const fill = select(FillTool);
        fill.getOptions()[0].action!();
        corners([0, 0], [100, 0], [100, 100], [0, 100]);
        fill.onKeyDown(keyEvent('Enter', 'Enter'));
        const lines = sceneryLines();
        expect(solidLines()).toHaveLength(0);
        expect(lines.length).toBeGreaterThan(5);
        for (const line of lines) {
            expect(Number.isInteger(line.pos.x) && Number.isInteger(line.endPos.y)).toBe(true);
            // Down to the right, at 45 degrees give or take the rounding
            const d = line.endPos.sub(line.pos);
            expect(Math.abs(Math.abs(d.x) - Math.abs(d.y))).toBeLessThanOrEqual(2);
        }
    });

    test('refuses a fill of too many lines, keeping the polygon to widen the spacing', () => {
        const fill = select(FillTool);
        FillTool.spacing = 5;
        corners([0, 0], [20000, 0], [20000, 20000], [0, 20000]);
        fill.onKeyDown(keyEvent('Enter', 'Enter'));
        expect(solidLines()).toHaveLength(0);
        expect(option(fill, 'Over').label).toBe(`Over ${MAX_FILL_LINES} lines: widen the spacing`);
        expect(option(fill, '4 corners')).toBeDefined();

        FillTool.spacing = 100;
        option(fill, 'Fill').action!();
        expect(solidLines().length).toBeGreaterThan(200);
        expect(option(fill, 'Over')).toBeUndefined();
    });

    test('previews the area and its lines without adding them', () => {
        const fill = select(FillTool);
        const strokes: number[] = [];
        const ctx = new Proxy({} as CanvasRenderingContext2D, {
            get: (_, name) =>
                name === 'stroke'
                    ? () => strokes.push(1)
                    : name === 'measureText'
                      ? () => ({ width: 0 })
                      : () => {},
            set: () => true,
        });
        corners([0, 0], [100, 0], [100, 100]);
        moveMouse(track, 0, 100);
        fill.render(ctx);
        // The crosshair, the outline, the lines and the first corner
        expect(strokes.length).toBe(4);
        expect(solidLines()).toHaveLength(0);
    });

    test('forgets the polygon when another tool is chosen', () => {
        const fill = select(FillTool);
        corners([0, 0], [100, 0]);
        fill.deactivate();
        expect(option(fill, 'Next').label).toBe('Next: click its corners');
    });
});

describe('Fill tool on an area closed by lines', () => {
    /** Adds solid lines joining points, closed, on the main layer. */
    const drawLoop = (...points: [number, number][]) =>
        points.forEach(([x, y], i) => {
            const [nx, ny] = points[(i + 1) % points.length];
            const line = new SolidLine(new Vector(x, y), new Vector(nx, ny), track);
            line.layer = track.layers.main[0];
            line.addToTrack();
        });

    const enclosed = () => {
        const fill = select(FillTool);
        FillTool.area = 'enclosed';
        FillTool.angle = 0;
        track.invalidateUI();
        return fill;
    };

    test('goes through the areas from its option, without an outline option', () => {
        const fill = select(FillTool);
        option(fill, 'Area').action!();
        option(fill, 'Area').action!();
        expect(option(fill, 'Area').label).toBe('Area: enclosed');
        expect(option(fill, 'Outline')).toBeUndefined();
        expect(option(fill, 'Next').label).toBe('Next: click inside closed lines');
        option(fill, 'Area').action!();
        expect(option(fill, 'Area').label).toBe('Area: polygon');
    });

    test('fills the area clicked inside, its lines ending on the lines closing it, undone at once', () => {
        drawLoop([0, 0], [100, 0], [100, 100], [0, 100]);
        enclosed();
        click(50, 50);

        const added = lineEnds().filter(([, y1, , y2]) => y1 === y2 && y1 > 0 && y1 < 100);
        expect(added).toEqual([20, 40, 60, 80].map((y) => [0, y, 100, y]));
        expect(solidLines()).toHaveLength(8);
        track.history.undo();
        expect(solidLines()).toHaveLength(4);
    });

    test('tells why nothing was filled: on a line, outside any closed area', () => {
        drawLoop([0, 0], [100, 0], [100, 100], [0, 100]);
        const fill = enclosed();
        click(100, 50);
        expect(option(fill, 'Clicked on').label).toBe('Clicked on a line');
        click(200, 50);
        expect(option(fill, 'Not closed').label).toBe('Not closed on screen');
        expect(solidLines()).toHaveLength(4);

        // Cleared by the next fill
        click(50, 50);
        expect(option(fill, 'Not closed')).toBeUndefined();
    });

    test('does not fill on a drag', () => {
        drawLoop([0, 0], [100, 0], [100, 100], [0, 100]);
        enclosed();
        drag(new Vector(20, 20), new Vector(80, 80));
        expect(solidLines()).toHaveLength(4);
    });

    /** A context counting the strokes drawn, the rest ignored. */
    const strokeCounter = () => {
        const counter = { strokes: 0, lines: 0 };
        const ctx = new Proxy({} as CanvasRenderingContext2D, {
            get: (_, name) =>
                name === 'stroke'
                    ? () => counter.strokes++
                    : name === 'lineTo'
                      ? () => counter.lines++
                      : name === 'measureText'
                        ? () => ({ width: 0 })
                        : () => {},
            set: () => true,
        });
        return { ctx, counter };
    };

    test('previews the lines a click adds under the pointer, the same ones', () => {
        drawLoop([0, 0], [100, 0], [100, 100], [0, 100]);
        const fill = enclosed();
        const { ctx, counter } = strokeCounter();

        moveMouse(track, 50, 50);
        fill.render(ctx);
        // The crosshair, then the 4 lines previewed
        expect(counter.lines).toBe(2 + 4);
        expect(solidLines()).toHaveLength(4);

        // Nothing under a pointer outside or on a line
        for (const [x, y] of [
            [200, 50],
            [100, 50],
        ]) {
            counter.lines = 0;
            moveMouse(track, x, y);
            fill.render(ctx);
            expect(counter.lines).toBe(2);
        }

        click(50, 50);
        expect(solidLines()).toHaveLength(8);
    });

    test('keeps the area found while the pointer stays in it, finding it again once edited', () => {
        drawLoop([0, 0], [100, 0], [100, 100], [0, 100]);
        const fill = enclosed();
        const { ctx } = strokeCounter();
        const hovered = () => (fill as unknown as { hovered: unknown }).hovered;

        moveMouse(track, 30, 30);
        fill.render(ctx);
        const first = hovered();
        moveMouse(track, 70, 60);
        fill.render(ctx);
        expect(hovered()).toBe(first);

        // Another spacing: the same area, its lines again
        FillTool.spacing = 50;
        fill.render(ctx);
        expect(hovered()).toBe(first);
        expect((first as { fill: { segments: unknown[] } }).fill.segments).toHaveLength(1);

        // A line splitting the square: found again
        drawLoop([50, 0], [50, 100]);
        fill.render(ctx);
        expect(hovered()).not.toBe(first);
        const half = (hovered() as { fill: { segments: [Vector, Vector][] } }).fill.segments;
        expect(half.map(([a, b]) => [a.x, b.x].sort((p, q) => p - q))).toEqual([[50, 100]]);
    });
});
