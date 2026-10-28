import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FAST_RENDER_THRESHOLD, RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { createPainter } from '../../src/openrider/render/painter';
import { renderCellWorker } from '../../src/openrider/thread/render-cell-worker';
import { RenderPriority, WorkerPool } from '../../src/openrider/thread/worker-pool';
import { Track } from '../../src/openrider/track/track';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { TrackParser } from '../../src/openrider/parser/track-parser';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';
import type { RenderCellDefinition } from '../../src/openrider/thread/render-cell-task';

/** Left of the cell of a task, in world units: its image bleeds by 1px. */
function cellLeft({ drawing }: RenderCellDefinition): number {
    return (drawing.offsetLeft + 1) / drawing.zoom;
}

class FakeBitmap {
    public closed = false;

    public constructor(
        public readonly width = 10,
        public readonly height = 10,
    ) {}

    public close(): void {
        this.closed = true;
    }
}

/** Worker double, answering the render tasks on demand. */
class FakeWorker {
    public static instances: FakeWorker[] = [];
    public readonly tasks: Array<{ id: number; task: RenderCellDefinition }> = [];
    private readonly listeners: Array<(e: { data: unknown }) => void> = [];

    public constructor() {
        FakeWorker.instances.push(this);
    }

    public addEventListener(_type: string, listener: (e: { data: unknown }) => void): void {
        this.listeners.push(listener);
    }

    public postMessage(message: { id: number; task: RenderCellDefinition }): void {
        this.tasks.push(message);
    }

    /** Answers the oldest task with a bitmap. */
    public reply(): FakeBitmap {
        const message = this.tasks.shift();
        if (!message) throw new Error('No task to answer');
        const bitmap = new FakeBitmap();
        this.listeners.forEach((listener) => listener({ data: { id: message.id, bitmap } }));
        return bitmap;
    }
}

const worker = () => FakeWorker.instances[0];

/** Answers every pending task, so that the pool is idle for the next test. */
function drainWorker(): void {
    while (worker()?.tasks.length) {
        worker().reply();
    }
}

let track: Track;

/** Render cell filled with enough lines to be rendered by the workers. */
function createHeavyCell(x = 0): RenderCell {
    const cell = new RenderCell(x, 0, 400);
    for (let i = 0; i <= FAST_RENDER_THRESHOLD; i++) {
        cell.push(new SolidLine(new Vector(x, i % 400), new Vector(x + 300, i % 400), track));
    }
    return cell;
}

beforeEach(() => {
    stubBrowser();
    vi.stubGlobal('ImageBitmap', FakeBitmap);
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:render-worker' });
    track = parseTrack('#####BMX#0 0');
});

afterEach(() => {
    drainWorker();
    vi.unstubAllGlobals();
    // e.g. the clock moved on past the edits
    vi.restoreAllMocks();
});

describe('Render cells', () => {
    test('render light cells synchronously, once per zoom and content version', () => {
        const cell = new RenderCell(0, 0, 400);
        cell.push(new SolidLine(new Vector(0, 0), new Vector(100, 0), track));

        const image = cell.getImage(0.6, { opacityFactor: 1, fastRender: true });
        expect(image?.zoom).toBe(0.6);
        expect(image?.version).toBe(cell.contentVersion);
        expect((image?.source as HTMLCanvasElement).width).toBe(400 * 0.6 + 2);
        expect(cell.getImage(0.6, { opacityFactor: 1, fastRender: true })).toEqual(image);

        cell.push(new SolidLine(new Vector(0, 10), new Vector(100, 10), track));
        expect(cell.isUpToDate(0.6)).toBe(false);
        expect(cell.getImage(0.6, { opacityFactor: 1, fastRender: true })?.source).not.toBe(
            image?.source,
        );
        expect(worker()).toBeUndefined();
    });

    test('render dense cells in the workers with the fast renderer', () => {
        const cell = createHeavyCell();

        // Nothing to display while the first image is rendering
        expect(cell.getImage(1, { opacityFactor: 1, fastRender: true })).toBeNull();
        expect(worker().tasks.map(({ task }) => task.drawing.zoom)).toEqual([1]);

        const bitmap = worker().reply();
        const image = cell.getImage(1, { opacityFactor: 1, fastRender: true });
        expect(image?.source).toBe(bitmap);
        expect(cell.isUpToDate(1)).toBe(true);
    });

    test('keep displaying the previous image while the edited cell renders', () => {
        const cell = createHeavyCell();
        cell.getImage(1, { opacityFactor: 1, fastRender: true });
        const bitmap = worker().reply();
        drainWorker();

        cell.push(new SolidLine(new Vector(0, 5), new Vector(100, 5), track));

        // No blank frame: the stale image is kept until the new one is rendered, shown with the
        // line added drawn on a copy of it
        const copy = cell.getImage(1, { opacityFactor: 1, fastRender: true })?.source;
        const drawn = vi.mocked((copy as HTMLCanvasElement).getContext('2d')!.drawImage);
        expect(drawn).toHaveBeenCalledWith(bitmap, 0, 0);
        // Not rendered again while it may still be edited, but once the edits pause
        expect(worker().tasks).toHaveLength(0);
        const now = performance.now();
        vi.spyOn(performance, 'now').mockReturnValue(now + 250);
        expect(cell.getImage(1, { opacityFactor: 1, fastRender: true })?.source).toBe(copy);
        const newBitmap = worker().reply();
        expect(bitmap.closed).toBe(true);
        expect(cell.getImage(1, { opacityFactor: 1, fastRender: true })?.source).toBe(newBitmap);
    });

    test('display the closest zoom level while the current one renders', () => {
        const cell = createHeavyCell();
        cell.getImage(1, { opacityFactor: 1, fastRender: true });
        worker().reply();
        drainWorker();

        const fallback = cell.getImage(1.4, { opacityFactor: 1, fastRender: true });

        // The adjacent zoom levels were rendered in the background, 1.2 is the closest one
        expect(fallback?.zoom).toBe(1.2);
        expect(worker().tasks[0].task.drawing.zoom).toBe(1.4);
    });

    test('render the fallback and adjacent zoom levels in the background', () => {
        const cell = createHeavyCell();
        cell.getImage(1, { opacityFactor: 1, fastRender: true });
        worker().reply();

        const zooms = [];
        while (worker().tasks.length) {
            zooms.push(worker().tasks[0].task.drawing.zoom);
            worker().reply();
        }

        // The low resolution fallback first, then the levels around the current zoom
        expect(zooms).toEqual([0.2, 0.8, 1.2]);
        expect([0.2, 0.8, 1, 1.2].every((zoom) => cell.isUpToDate(zoom))).toBe(true);
    });

    test('scale their closest image while the zoom changes, rendered once it settles', () => {
        const cell = new RenderCell(0, 0, 400);
        cell.push(new SolidLine(new Vector(0, 10), new Vector(300, 10), track));
        const options = { opacityFactor: 1, fastRender: true };
        const first = cell.getImage(1, options);

        // The image of the zoom before, as it is
        expect(cell.getImage(1.2, { ...options, settled: false })?.source).toBe(first?.source);
        expect(cell.imageState(1.2)).toBe('other-zoom');
        expect(cell.getImage(1.2, options)?.zoom).toBe(1.2);
    });

    test('render the dense cells at the zoom eased to, while it changes', () => {
        const cell = createHeavyCell();
        cell.storeImage(1, cell.contentVersion, new FakeBitmap() as unknown as ImageBitmap);

        const image = cell.getImage(1.4, {
            opacityFactor: 1,
            fastRender: true,
            settled: false,
            targetZoom: 2,
        });

        expect(image?.zoom).toBe(1);
        expect(worker().tasks.map(({ task }) => task.drawing.zoom)).toEqual([2]);
    });

    test('keep a few images, the one of the lowest zoom always', () => {
        const cell = new RenderCell(0, 0, 400);
        cell.push(new SolidLine(new Vector(0, 10), new Vector(300, 10), track));
        const zooms = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6];
        zooms.forEach((zoom) => cell.getImage(zoom, { opacityFactor: 1, fastRender: false }));

        // The least recently displayed ones dropped, the fallback kept
        const kept = zooms.filter((zoom) => cell.imageState(zoom) === 'current');
        expect(kept).toEqual([0.2, 0.8, 1, 1.2, 1.4, 1.6]);
    });

    test('ignore images rendered for an older content than the stored one', () => {
        const cell = createHeavyCell();
        const recent = new FakeBitmap();
        const old = new FakeBitmap();

        cell.storeImage(1, cell.contentVersion, recent as unknown as ImageBitmap);
        cell.storeImage(1, cell.contentVersion - 1, old as unknown as ImageBitmap);

        expect(cell.getImage(1, { opacityFactor: 1, fastRender: true })?.source).toBe(recent);
        expect(old.closed).toBe(true);
    });
});

describe('Worker pool', () => {
    test('renders the most urgent requests first, without duplicates', () => {
        const first = createHeavyCell(0);
        const second = createHeavyCell(400);
        const third = createHeavyCell(800);
        const done = vi.fn();

        // The single worker takes the first request, the others wait in the queue
        WorkerPool.request(first, 1, 1, RenderPriority.ADJACENT, done);
        WorkerPool.request(second, 1, 1, RenderPriority.ADJACENT);
        WorkerPool.request(third, 1, 1, RenderPriority.ADJACENT);
        WorkerPool.request(third, 1, 1, RenderPriority.VISIBLE);
        WorkerPool.request(first, 1, 1, RenderPriority.VISIBLE, done);

        const rendered = [];
        while (worker().tasks.length) {
            rendered.push(cellLeft(worker().tasks[0].task));
            worker().reply();
        }

        expect(rendered).toEqual([0, 800, 400]);
        // The duplicate request of the running task is called back with it
        expect(done).toHaveBeenCalledTimes(2);
    });

    test('creates one worker per core but one, and at least one', () => {
        expect(FakeWorker.instances).toHaveLength(1);
    });
});

describe('Render worker', () => {
    test('renders the lines of a task and sends back a bitmap', () => {
        let onMessage: (e: MessageEvent) => void = () => {};
        const postMessage = vi.fn();
        const { context } = createCanvasMock();
        vi.stubGlobal('self', {
            addEventListener: (_type: string, listener: typeof onMessage) => (onMessage = listener),
            postMessage,
            // As the blob of the worker pool sets it
            painter: createPainter(),
        });
        vi.stubGlobal(
            'OffscreenCanvas',
            class {
                public constructor(
                    public readonly width: number,
                    public readonly height: number,
                ) {}
                public getContext = () => context;
                public transferToImageBitmap = () => new FakeBitmap(this.width, this.height);
            },
        );

        renderCellWorker();
        onMessage({
            data: {
                id: 7,
                task: {
                    cellSize: 400,
                    drawing: {
                        zoom: 0.5,
                        opacityFactor: 0.5,
                        offsetLeft: 400 * 0.5 - 1,
                        offsetTop: -1,
                        // A scenery line of color 3, then two solid lines
                        scenery: new Int32Array([400, 0, 500, 0, 3]),
                        sceneryColors: ['#aaa', '#111', '#222', '#333'],
                        lines: new Int32Array([400, 10, 500, 10, 400, 20, 500, 20]),
                        sprites: new Float64Array(),
                        spriteColors: [],
                    },
                },
            },
        } as MessageEvent);

        const [[message, transfer]] = postMessage.mock.calls;
        expect(message.id).toBe(7);
        expect(message.bitmap).toMatchObject({ width: 202, height: 202 });
        expect(transfer).toEqual([message.bitmap]);
        // The scenery line, then the two solid lines, each kind as a single path
        expect(vi.mocked(context.stroke)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(context.lineTo)).toHaveBeenCalledTimes(3);
        expect(context.globalAlpha).toBe(0.5);
    });
});

describe('Fast renderer support', () => {
    /** Track code with enough solid lines in the first cell to be rendered by the workers. */
    function heavyTrackCode(): string {
        return Array.from({ length: FAST_RENDER_THRESHOLD + 1 }, (_, i) => {
            const y = (i % 300).toString(32);
            return `0 ${y} a ${y}`;
        }).join(',');
    }

    test('renders every cell synchronously without workers support', () => {
        const heavy = parseTrack(`${heavyTrackCode()}#####BMX#0 0`);
        const cell = heavy.layers.main[0].cache.cell(0, 0);
        expect(WorkerPool.supported).toBe(false);
        expect(cell.isHeavy()).toBe(true);

        TrackRenderer.render(createCanvasMock().context, heavy);

        expect(cell.isUpToDate(heavy.zoomFactor)).toBe(true);
        expect(worker()?.tasks ?? []).toHaveLength(0);
    });

    test('renders the dense cells in the workers by default when supported', () => {
        vi.stubGlobal('OffscreenCanvas', class {});
        const heavy = parseTrack('#####BMX#0 0');
        const cell = heavy.layers.main[0].cache.cell(0, 0);
        for (let i = 0; i <= FAST_RENDER_THRESHOLD; i++) {
            cell.push(new SolidLine(new Vector(0, i % 400), new Vector(300, i % 400), heavy));
        }
        expect(WorkerPool.supported).toBe(true);

        TrackRenderer.render(createCanvasMock().context, heavy);

        expect(cell.isUpToDate(heavy.zoomFactor)).toBe(false);
        expect(worker().tasks.map(({ task }) => task.drawing.zoom)).toContain(heavy.zoomFactor);
    });
});

describe('Track parser', () => {
    test('pre-renders the dense cells at the lowest zoom, those around the start at its zoom', () => {
        vi.stubGlobal('OffscreenCanvas', class {});
        // A dense cell at the start, and another one far away
        const line = (x: number, y: number) =>
            [x, y, x + 300, y].map((value) => value.toString(32)).join(' ');
        const lines: string[] = [];
        for (let i = 0; i <= FAST_RENDER_THRESHOLD; i++) {
            lines.push(line(0, i % 400), line(40000, i % 400));
        }
        const dense = new Track(null);
        const parser = new TrackParser(dense);
        parser.init(`${lines.join(',')}#####BMX#0 0`);

        const rendered = new Map<number, number[]>();
        for (let step = 0; step < 10000 && !parser.done; step++) {
            parser.currentStep();
            parser.updateIndicators();
            while (worker()?.tasks.length) {
                const { task } = worker().tasks[0];
                const left = cellLeft(task);
                rendered.set(left, [...(rendered.get(left) ?? []), task.drawing.zoom]);
                worker().reply();
            }
        }

        expect(parser.done).toBe(true);
        expect(rendered.get(0)?.sort()).toEqual([0.2, dense.zoomFactor].sort());
        expect(rendered.get(40000)).toEqual([0.2]);
    });
});

describe('Track renderer', () => {
    test('draws the visible cells, scaling the images rendered at another zoom', () => {
        const { context } = createCanvasMock();
        const heavy = parseTrack('#####BMX#0 0');
        const cell = heavy.layers.main[0].cache.cell(0, 0);
        for (let i = 0; i <= FAST_RENDER_THRESHOLD; i++) {
            cell.push(new SolidLine(new Vector(0, i % 400), new Vector(300, i % 400), heavy));
        }
        cell.storeImage(1, cell.contentVersion, new FakeBitmap(402, 402) as unknown as ImageBitmap);
        heavy.zoomFactor = 0.6;
        drainWorker();

        TrackRenderer.render(context, heavy, { fastRender: true });

        const drawImage = vi.mocked(context.drawImage);
        const scaled = drawImage.mock.calls.find((call) => (call as unknown[]).length === 5);
        expect(scaled?.[3]).toBeCloseTo(402 * 0.6);
    });

    test('draws the debug overlay of the grids and the runners', () => {
        const { context, calls } = createCanvasMock();

        TrackRenderer.render(context, track, { debug: true });

        expect(calls).toContain('moveTo');
        expect(calls).toContain('fillRect');
    });
});
