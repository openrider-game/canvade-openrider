import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { ITEM_MAP } from '../../src/openrider/item/item.constants';
import { packItemSprites, spriteCode } from '../../src/openrider/item/item-sprite';
import { StatusItem } from '../../src/openrider/item/status-item';
import { painter } from '../../src/openrider/render/painter';
import type { ReachableItem } from '../../src/openrider/item/reachable-item';
import { RenderCellTask } from '../../src/openrider/thread/render-cell-task';
import type { Track } from '../../src/openrider/track/track';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/**
 * A target at (398, 10), 2 units from the right edge of its render cell, and a boost at (10, 10)
 * turned by 90 degrees (stored as -90 in base 32, see `DirectionalItem`).
 */
const SPRITES_TRACK = '-50 1i 1k0 1i##T ce a,B a a -2q,#0 -a a -a##BMX#0 0';

let track: Track;

/** Render cell of the main layer at grid coordinates. */
function cacheCell(x: number, y: number): RenderCell {
    return track.layers.main[0].cache.cell(x, y);
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack(SPRITES_TRACK);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Status effects', () => {
    test('have a shape of their own, the reset items keeping the square', () => {
        const statuses = [...ITEM_MAP.values()].filter(
            (itemClass) =>
                (itemClass as unknown as { prototype: object }).prototype instanceof StatusItem,
        );
        const shapes = statuses.map(
            (itemClass) =>
                (
                    Object.create(
                        (itemClass as unknown as { prototype: object }).prototype,
                    ) as StatusItem
                ).sprite,
        );

        expect(statuses.length).toBe(10);
        expect(new Set(shapes).size).toBe(statuses.length);
        expect(shapes).toContain('square');

        // Each one drawn, filled and outlined
        for (const shape of shapes) {
            const { context, calls } = createCanvasMock();
            painter.drawItem(context, spriteCode(shape), '#f00', 50, 50, 0, 1);
            expect(calls).toContain('fill');
            expect(calls).toContain('stroke');
        }
    });
});

describe('Item sprites', () => {
    test('are stored in every render cell they reach, the physics keeping a single cell', () => {
        const target = [...track.targets.values()][0];

        // Reaching over the edge of its cell, drawn by both
        expect(cacheCell(0, 0).objects).toContain(target);
        expect(cacheCell(1, 0).objects).toContain(target);
        // Collided in the cell of its position only
        const physicsCells = [...track.layers.main[0].grid.cells.values()].filter((cell) =>
            cell.objects.includes(target),
        );
        expect(physicsCells).toHaveLength(1);
        // Drawn in the images, not on every frame
        expect(cacheCell(0, 0).liveObjects).toEqual([]);
        expect(cacheCell(0, 0).sprites).toBe(2);
    });

    test('make the images of the cells they reach stale when removed', () => {
        const target = [...track.targets.values()][0];
        const versions = [cacheCell(0, 0).contentVersion, cacheCell(1, 0).contentVersion];

        target.removeFromTrack();

        expect(cacheCell(0, 0).contentVersion).toBeGreaterThan(versions[0]);
        expect(cacheCell(1, 0).contentVersion).toBeGreaterThan(versions[1]);
        expect(cacheCell(1, 0).objects).not.toContain(target);
    });

    test('are drawn with their color, the arrows turned by their rotation', () => {
        const { context, calls } = createCanvasMock();
        const { buffer, colors } = packItemSprites(cacheCell(0, 0).objects);

        painter.drawSprites(context, new Float64Array(buffer), colors, 2, 0, 0);

        expect(calls.filter((call) => call === 'fill')).toHaveLength(2);
        expect(vi.mocked(context.arc)).toHaveBeenCalledWith(796, 20, 14, 0, 2 * Math.PI, true);
        // The point of the arrow, down without rotation, to the left once turned by 90 degrees
        const [x, y] = vi.mocked(context.lineTo).mock.calls[0];
        expect([x, Math.round(y)]).toEqual([0, 20]);
        // The target and the boost share their yellow, listed once
        expect(colors).toEqual(['#ff0']);
    });

    test('are sent to the workers with the lines', () => {
        const task = new RenderCellTask(cacheCell(0, 0), 1, 1);

        expect(task.definition.drawing.sprites).toHaveLength(10);
        expect(task.definition.drawing.spriteColors).toEqual(['#ff0']);
        expect(task.transferables).toContain(task.definition.drawing.sprites.buffer);
    });
});

describe('Reached items', () => {
    test('are stamped once on the overlay of their cell, drawn over the cell images', () => {
        const [target] = [...track.targets.values()] as ReachableItem[];
        track.focalPoint = null;
        // Canvases created by the frames: the cell images, then the overlays
        const created: Array<ReturnType<typeof createCanvasMock>> = [];
        vi.stubGlobal('document', {
            ...document,
            createElement: () => {
                const canvas = createCanvasMock(0, 0);
                created.push(canvas);
                return canvas.canvas;
            },
        });
        /** Draws a frame, returning the canvases it created. */
        const frame = (camera: Vector) => {
            track.camera.set(camera);
            const from = created.length;
            TrackRenderer.render(createCanvasMock().context, track, { fastRender: false });
            return created.slice(from);
        };
        frame(target.pos);

        target.reached = true;
        const [overlay, ...others] = frame(target.pos);
        expect(track.reachedItems.has(target)).toBe(true);
        expect(others).toEqual([]);
        expect(overlay.calls.filter((call) => call === 'arc')).toHaveLength(1);
        expect(overlay.context.fillStyle).toBe('#ffa');

        // The next frames reuse the overlay, without drawing the item again
        expect(frame(target.pos)).toEqual([]);
        expect(overlay.calls.filter((call) => call === 'arc')).toHaveLength(1);

        // Out of view, not drawn
        const outOfView = frame(new Vector(5000, 5000));
        expect(outOfView).toEqual([]);

        track.restart();
        expect(track.reachedItems.size).toBe(0);
        frame(target.pos);
        expect(overlay.calls.filter((call) => call === 'arc')).toHaveLength(1);
    });

    test('are drawn at a new zoom once it stops changing', () => {
        const [target] = [...track.targets.values()] as ReachableItem[];
        track.focalPoint = null;
        track.camera.set(target.pos);
        const created: CanvasRenderingContext2D[] = [];
        vi.stubGlobal('document', {
            ...document,
            createElement: () => {
                const canvas = createCanvasMock(0, 0);
                created.push(canvas.context);
                return canvas.canvas;
            },
        });
        const frame = () =>
            TrackRenderer.render(createCanvasMock().context, track, { fastRender: false });
        let now = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        target.reached = true;
        frame();
        // The overlays, drawing in the reached color unlike the cell images
        const overlays = () => created.filter((context) => context.fillStyle === '#ffa').length;
        expect(overlays()).toBe(1);

        // While zooming, the overlay is scaled; once the zoom settled, drawn again
        track.zoomFactor *= 1.5;
        frame();
        expect(overlays()).toBe(1);
        now += 100;
        frame();
        expect(overlays()).toBe(1);
        now += 100;
        frame();
        expect(overlays()).toBe(2);
    });

    test('leave the list once removed from the track', () => {
        const target = [...track.targets.values()][0];
        target.reached = true;

        target.removeFromTrack();

        expect(track.reachedItems.size).toBe(0);
    });
});

describe('Stacked items', () => {
    test('are drawn once per look and spot, the last copy keeping its place', () => {
        // Three targets and a checkpoint on the same spot, then a target elsewhere
        const stacked = parseTrack(
            '-50 1i 1k0 1i##T a a,T a a,C a a,T a a,T k a,#0 -a a -a##BMX#0 0',
        );
        const items = [...stacked.layers.main[0].grid.totalObjects.values()];

        const { buffer, colors } = packItemSprites(items);
        const sprites = new Float64Array(buffer);
        const looks = [];
        for (let i = 0; i < sprites.length; i += 5) {
            looks.push(`${colors[sprites[i + 1]]} ${sprites[i + 2]}`);
        }

        // The checkpoint, then the last target of the stack over it, then the other target
        expect(looks).toEqual(['#00f 10', '#ff0 10', '#ff0 20']);
    });

    test('keep apart the items of the same spot in another state, out of the cell images', () => {
        const stacked = parseTrack('-50 1i 1k0 1i##T a a,T a a,#0 -a a -a##BMX#0 0');
        const [first, second] = [...stacked.targets.values()];
        first.reached = true;

        // In the cell images, in the color of their kind
        expect(packItemSprites([first, second]).colors).toEqual(['#ff0']);
        expect(packItemSprites([first, second], true).colors).toEqual(['#ff0', '#ffa']);
    });
});
