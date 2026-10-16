import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FAST_RENDER_THRESHOLD, RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { renderCellWorker } from '../../src/openrider/thread/render-cell-worker';
import { RenderPriority, WorkerPool } from '../../src/openrider/thread/worker-pool';
import { Track } from '../../src/openrider/track/track';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

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
    public readonly tasks: Array<{ id: number; task: { zoom: number; x: number } }> = [];
    private readonly listeners: Array<(e: { data: unknown }) => void> = [];

    public constructor() {
        FakeWorker.instances.push(this);
    }

    public addEventListener(_type: string, listener: (e: { data: unknown }) => void): void {
        this.listeners.push(listener);
    }

    public postMessage(message: { id: number; task: { zoom: number; x: number } }): void {
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
});

describe('Render cells', () => {
    test('render light cells synchronously, once per zoom and content version', () => {
        const cell = new RenderCell(0, 0, 400);
        cell.push(new SolidLine(new Vector(0, 0), new Vector(100, 0), track));

        const image = cell.getImage(0.6, 1, true);
        expect(image?.zoom).toBe(0.6);
        expect(image?.version).toBe(cell.contentVersion);
        expect((image?.source as HTMLCanvasElement).width).toBe(400 * 0.6 + 2);
        expect(cell.getImage(0.6, 1, true)).toEqual(image);

        cell.push(new SolidLine(new Vector(0, 10), new Vector(100, 10), track));
        expect(cell.isUpToDate(0.6)).toBe(false);
        expect(cell.getImage(0.6, 1, true)?.source).not.toBe(image?.source);
        expect(worker()).toBeUndefined();
    });

    test('render dense cells in the workers with the fast renderer', () => {
        const cell = createHeavyCell();

        // Nothing to display while the first image is rendering
        expect(cell.getImage(1, 1, true)).toBeNull();
        expect(worker().tasks.map(({ task }) => task.zoom)).toEqual([1]);

        const bitmap = worker().reply();
        const image = cell.getImage(1, 1, true);
        expect(image?.source).toBe(bitmap);
        expect(cell.isUpToDate(1)).toBe(true);
    });

    test('keep displaying the previous image while the edited cell renders', () => {
        const cell = createHeavyCell();
        cell.getImage(1, 1, true);
        const bitmap = worker().reply();
        drainWorker();

        cell.push(new SolidLine(new Vector(0, 5), new Vector(100, 5), track));

        // No blank frame: the stale image is kept until the new one is rendered
        expect(cell.getImage(1, 1, true)?.source).toBe(bitmap);
        const newBitmap = worker().reply();
        expect(bitmap.closed).toBe(true);
        expect(cell.getImage(1, 1, true)?.source).toBe(newBitmap);
    });

    test('display the closest zoom level while the current one renders', () => {
        const cell = createHeavyCell();
        cell.getImage(1, 1, true);
        worker().reply();
        drainWorker();

        const fallback = cell.getImage(1.4, 1, true);

        // The adjacent zoom levels were rendered in the background, 1.2 is the closest one
        expect(fallback?.zoom).toBe(1.2);
        expect(worker().tasks[0].task.zoom).toBe(1.4);
    });

    test('render the fallback and adjacent zoom levels in the background', () => {
        const cell = createHeavyCell();
        cell.getImage(1, 1, true);
        worker().reply();

        const zooms = [];
        while (worker().tasks.length) {
            zooms.push(worker().tasks[0].task.zoom);
            worker().reply();
        }

        // The low resolution fallback first, then the levels around the current zoom
        expect(zooms).toEqual([0.2, 0.8, 1.2]);
        expect([0.2, 0.8, 1, 1.2].every((zoom) => cell.isUpToDate(zoom))).toBe(true);
    });

    test('ignore images rendered for an older content than the stored one', () => {
        const cell = createHeavyCell();
        const recent = new FakeBitmap();
        const old = new FakeBitmap();

        cell.storeImage(1, cell.contentVersion, recent as unknown as ImageBitmap);
        cell.storeImage(1, cell.contentVersion - 1, old as unknown as ImageBitmap);

        expect(cell.getImage(1, 1, true)?.source).toBe(recent);
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
            rendered.push(worker().tasks[0].task.x);
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
                    zoom: 0.5,
                    opacityFactor: 0.5,
                    x: 400,
                    y: 0,
                    sceneryBuffer: new Int32Array([400, 0, 500, 0]).buffer,
                    lineBuffer: new Int32Array([400, 10, 500, 10, 400, 20, 500, 20]).buffer,
                },
            },
        } as MessageEvent);

        const [[message, transfer]] = postMessage.mock.calls;
        expect(message.id).toBe(7);
        expect(message.bitmap).toMatchObject({ width: 202, height: 202 });
        expect(transfer).toEqual([message.bitmap]);
        expect(vi.mocked(context.stroke)).toHaveBeenCalledTimes(3);
        expect(context.globalAlpha).toBe(0.5);
    });
});

describe('Track renderer', () => {
    test('draws the visible cells, scaling the images rendered at another zoom', () => {
        const { context } = createCanvasMock();
        const heavy = parseTrack('#####BMX#0 0');
        const cell = heavy.mainLayer.cache.cell(0, 0);
        for (let i = 0; i <= FAST_RENDER_THRESHOLD; i++) {
            cell.push(new SolidLine(new Vector(0, i % 400), new Vector(300, i % 400), heavy));
        }
        heavy.fastRender = true;
        cell.storeImage(1, cell.contentVersion, new FakeBitmap(402, 402) as unknown as ImageBitmap);
        heavy.zoomFactor = 0.6;
        drainWorker();

        TrackRenderer.render(context, heavy, false);

        const drawImage = vi.mocked(context.drawImage);
        const scaled = drawImage.mock.calls.find((call) => (call as unknown[]).length === 5);
        expect(scaled?.[3]).toBeCloseTo(402 * 0.6);
    });

    test('draws the debug overlay of the grids and the runners', () => {
        const { context, calls } = createCanvasMock();

        TrackRenderer.render(context, track, true);

        expect(calls).toContain('moveTo');
        expect(calls).toContain('fillRect');
    });
});
