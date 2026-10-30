import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { REDRAW_EDITS } from '../../src/openrider/grid/cell/cell-patcher';
import type { RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { WorkerPool } from '../../src/openrider/thread/worker-pool';
import type { Track } from '../../src/openrider/track/track';
import { type CanvasMock, createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/** 600 short lines in the first render cell: more than the workers threshold. */
const DENSE_TRACK =
    '-50 1i 1k0 1i,' +
    Array.from({ length: 600 }, (_, i) => {
        const x = (i % 30) * 10;
        const y = Math.floor(i / 30) * 10;
        return `${x.toString(32)} ${y.toString(32)} ${(x + 5).toString(32)} ${y.toString(32)}`;
    }).join(',') +
    '###BMX#0 0';

const ZOOM = 1;
const OPTIONS = { opacityFactor: 1, fastRender: true };

let track: Track;
let cell: RenderCell;
/** Canvases created since the start of the test, with their drawing calls. */
let created: CanvasMock[];

beforeEach(() => {
    stubBrowser();
    // The workers rendering in the background, what is displayed meanwhile being tested
    vi.spyOn(WorkerPool, 'request').mockImplementation(() => undefined);
    created = [];
    vi.stubGlobal('document', {
        ...document,
        createElement: () => {
            const canvas = createCanvasMock(0, 0);
            created.push(canvas);
            return canvas.canvas;
        },
    });
    track = parseTrack(DENSE_TRACK);
    cell = track.layers.main[0].cache.cell(0, 0);
    // The image rendered by the workers for the content parsed
    cell.storeImage(ZOOM, cell.contentVersion, createCanvasMock(402, 402).canvas);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Adds a solid line to the main layer of the track. */
function addLine(from: [number, number], to: [number, number]): SolidLine {
    const line = new SolidLine(new Vector(...from), new Vector(...to), track);
    line.layer = track.layers.main[0];
    line.addToTrack();
    return line;
}

describe('Dense cells edited while the workers render them', () => {
    test('show the lines drawn at once, on a copy of the stale image', () => {
        expect(cell.isHeavy()).toBe(true);
        const stale = cell.getImage(ZOOM, OPTIONS)?.source;

        addLine([10, 250], [80, 250]);
        const shown = cell.getImage(ZOOM, OPTIONS);

        expect(shown?.source).not.toBe(stale);
        const [patch] = created;
        expect(patch.calls.slice(0, 1)).toEqual(['drawImage']);
        expect(patch.calls).toContain('stroke');
        expect(patch.context.strokeStyle).toBe('#000');

        // The next frame draws nothing more, the copy being reused
        const calls = patch.calls.length;
        expect(cell.getImage(ZOOM, OPTIONS)?.source).toBe(shown?.source);
        expect(patch.calls.length).toBe(calls);
    });

    test('repaint the area of an erased line, the lines it crossed drawn again', () => {
        // Across the column of short lines starting at x = 100, one every 10 units down to 190
        const line = addLine([102, -5], [102, 195]);
        cell.getImage(ZOOM, OPTIONS);
        const [patch] = created;
        const moves = vi.mocked(patch.context.moveTo);
        moves.mockClear();

        line.removeFromTrack();
        cell.getImage(ZOOM, OPTIONS);

        // Cleared within the area of the line, then drawn again in it
        expect(patch.calls).toEqual(expect.arrayContaining(['clip', 'clearRect', 'stroke']));
        const starts = moves.mock.calls.map(([x, y]) => `${x},${y}`);
        // The crossed lines, in canvas pixels of the image, bleeding by 1px
        for (const y of [0, 50, 190]) {
            expect(starts).toContain(`101,${y + 1}`);
        }
        // Not the erased line, nor the lines far from it
        expect(starts).not.toContain('103,-4');
        expect(starts.some((start) => start.startsWith('281,'))).toBe(false);
    });

    test('show the image of the workers once rendered, without patching it', () => {
        addLine([10, 250], [80, 250]);
        cell.getImage(ZOOM, OPTIONS);
        const rendered = createCanvasMock(402, 402).canvas;

        cell.storeImage(ZOOM, cell.contentVersion, rendered);

        expect(cell.getImage(ZOOM, OPTIONS)?.source).toBe(rendered);
    });

    test('draw the copy again entirely past the edits it repaints at once, then repaint again', () => {
        const stale = cell.getImage(ZOOM, OPTIONS)?.source;
        // More edits in a single frame than repainting them is worth
        for (let i = 0; i <= REDRAW_EDITS; i++) {
            addLine([i % 300, 280], [(i % 300) + 6, 290]);
        }

        const shown = cell.getImage(ZOOM, OPTIONS)?.source;
        expect(shown).not.toBe(stale);
        const [patch] = created;
        // Cleared, then every line of the cell drawn, without clipping to the edits
        expect(patch.calls).toContain('clearRect');
        expect(patch.calls).not.toContain('clip');
        const strokes = patch.calls.filter((call) => call === 'stroke').length;
        expect(strokes).toBeGreaterThan(600 + REDRAW_EDITS);

        // The next edit is repainted on the copy
        addLine([10, 250], [80, 250]);
        expect(cell.getImage(ZOOM, OPTIONS)?.source).toBe(shown);
        expect(patch.calls).toContain('clip');
    });
});
