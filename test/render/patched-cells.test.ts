import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

    test('cut the erased lines out of the copy', () => {
        const line = addLine([10, 250], [80, 250]);
        cell.getImage(ZOOM, OPTIONS);
        const [patch] = created;
        const operations: string[] = [];
        Object.defineProperty(patch.context, 'globalCompositeOperation', {
            set: (value: string) => operations.push(value),
            get: () => operations.at(-1) ?? 'source-over',
        });

        line.removeFromTrack();
        cell.getImage(ZOOM, OPTIONS);

        expect(operations).toContain('destination-out');
    });

    test('show the image of the workers once rendered, without patching it', () => {
        addLine([10, 250], [80, 250]);
        cell.getImage(ZOOM, OPTIONS);
        const rendered = createCanvasMock(402, 402).canvas;

        cell.storeImage(ZOOM, cell.contentVersion, rendered);

        expect(cell.getImage(ZOOM, OPTIONS)?.source).toBe(rendered);
    });

    test('show the stale image as it is past the edits kept', () => {
        const stale = cell.getImage(ZOOM, OPTIONS)?.source;
        for (let i = 0; i < 501; i++) {
            addLine([i % 300, 280], [(i % 300) + 6, 290]);
        }

        expect(cell.getImage(ZOOM, OPTIONS)?.source).toBe(stale);
    });
});
