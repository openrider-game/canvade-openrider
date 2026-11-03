import type { RenderCell } from '../grid/cell/render-cell';
import { createPainter } from '../render/painter';
import { RenderCellTask } from './render-cell-task';
import { renderCellWorker } from './render-cell-worker';

/** Priority of a render request, lower values being rendered first. */
export enum RenderPriority {
    /** Visible cells at the current zoom. */
    VISIBLE = 0,
    /** Cells rendered ahead while parsing the track. */
    PRELOAD = 1,
    /** Low resolution image displayed while the right zoom level is rendering. */
    FALLBACK = 2,
    /** Zoom levels around the current one, ready before the player zooms. */
    ADJACENT = 3,
}

interface RenderRequest {
    cell: RenderCell;
    zoom: number;
    opacityFactor: number;
    priority: RenderPriority;
    callbacks: Array<() => void>;
}

interface RunningRequest {
    request: RenderRequest;
    /** Content version of the cell sent to the worker. */
    version: number;
    zoom: number;
}

/**
 * Pool of workers rendering the cells in the background, used by the fast renderer.
 *
 * Requests are deduplicated by cell and zoom level, and each idle worker takes the most urgent
 * request. The workers are created on the first request.
 */
export abstract class WorkerPool {
    /**
     * Whether the browser can render the cells in workers, which requires `OffscreenCanvas`.
     * Without it, every cell is rendered on the main thread.
     */
    public static get supported(): boolean {
        return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    }

    private static readonly idleWorkers: Worker[] = [];
    private static workerCount = 0;
    private static taskId = 0;

    /**
     * Pending requests by `cellId:zoom`, one map for each priority, by its value: each in the
     * order of the requests, the most urgent being the first of the first map holding any.
     */
    private static readonly queues: Array<Map<string, RenderRequest>> = [
        RenderPriority.VISIBLE,
        RenderPriority.PRELOAD,
        RenderPriority.FALLBACK,
        RenderPriority.ADJACENT,
    ].map(() => new Map());
    /** Requests being rendered, by task id. */
    private static readonly running = new Map<number, RunningRequest>();

    /** Number of requests waiting for a worker. */
    public static get queuedCount(): number {
        return WorkerPool.queues.reduce((count, queue) => count + queue.size, 0);
    }

    /** Number of requests being rendered by the workers. */
    public static get runningCount(): number {
        return WorkerPool.running.size;
    }

    private static createWorkers(): void {
        const source = URL.createObjectURL(
            new Blob(
                [
                    // A painter of its own, drawing as the one of the main thread
                    `self.painter = (${createPainter.toString()})();`,
                    `(${renderCellWorker.toString()})()`,
                ],
                { type: 'text/javascript' },
            ),
        );
        // Keeps a core for the main thread, but always has at least one worker
        WorkerPool.workerCount = Math.max(1, navigator.hardwareConcurrency - 1);

        for (let i = 0; i < WorkerPool.workerCount; i++) {
            const worker = new Worker(source);
            worker.addEventListener('message', (e) =>
                WorkerPool.receiveResult(worker, e.data.id, e.data.bitmap),
            );
            WorkerPool.idleWorkers.push(worker);
        }
    }

    /**
     * Asks for the cell to be rendered at the given zoom level.
     *
     * A request already queued for the same cell and zoom is kept, with the most urgent of both
     * priorities. A request already running on the current content of the cell is not queued again.
     *
     * @param opacityFactor - Opacity of the lines, depending on the layer.
     * @param callback - Called once the cell is rendered, or found up to date.
     */
    public static request(
        cell: RenderCell,
        zoom: number,
        opacityFactor: number,
        priority: RenderPriority,
        callback?: () => void,
    ): void {
        // Already being rendered with the same content
        const running = [...WorkerPool.running.values()].find(
            ({ request, version, zoom: runningZoom }) =>
                request.cell === cell && runningZoom === zoom && version === cell.contentVersion,
        );
        if (running) {
            if (callback) {
                running.request.callbacks.push(callback);
            }
            return;
        }

        const key = `${cell.id}:${zoom}`;
        const queued = WorkerPool.queued(key);
        if (queued) {
            if (priority < queued.priority) {
                // Moved to the more urgent queue, after its requests
                WorkerPool.queues[queued.priority].delete(key);
                queued.priority = priority;
                WorkerPool.queues[priority].set(key, queued);
            }
            if (callback) {
                queued.callbacks.push(callback);
            }
            return;
        }

        WorkerPool.queues[priority].set(key, {
            cell,
            zoom,
            opacityFactor,
            priority,
            callbacks: callback ? [callback] : [],
        });
        WorkerPool.dispatch();
    }

    /** Sends the most urgent requests to the idle workers, creating them if needed. */
    private static dispatch(): void {
        if (!WorkerPool.workerCount) {
            WorkerPool.createWorkers();
        }

        for (
            let urgent = WorkerPool.takeMostUrgent();
            urgent && WorkerPool.idleWorkers.length;
            urgent = WorkerPool.takeMostUrgent()
        ) {
            const [key, request] = urgent;
            WorkerPool.queues[request.priority].delete(key);

            // Rendered meanwhile, e.g. synchronously
            if (request.cell.isUpToDate(request.zoom)) {
                request.callbacks.forEach((callback) => callback());
                continue;
            }

            const worker = WorkerPool.idleWorkers.pop() as Worker;
            // The lines are read now, so the most recent content is rendered
            const task = new RenderCellTask(request.cell, request.zoom, request.opacityFactor);
            const id = WorkerPool.taskId++;

            WorkerPool.running.set(id, { request, version: task.version, zoom: request.zoom });
            worker.postMessage({ id, task: task.definition }, task.transferables);
        }
    }

    /**
     * The request with the lowest priority value, the oldest one of its queue, null without any:
     * the first of the first queue holding any.
     */
    private static takeMostUrgent(): [string, RenderRequest] | null {
        for (const queue of WorkerPool.queues) {
            const first = queue.entries().next();
            if (!first.done) {
                return first.value;
            }
        }
        return null;
    }

    /** A pending request, whatever its priority. */
    private static queued(key: string): RenderRequest | undefined {
        for (const queue of WorkerPool.queues) {
            const request = queue.get(key);
            if (request) {
                return request;
            }
        }
        return undefined;
    }

    /** Stores a rendered bitmap in its cell, closing it if the request is unknown. */
    private static receiveResult(worker: Worker, id: number, bitmap: ImageBitmap): void {
        WorkerPool.idleWorkers.push(worker);

        const running = WorkerPool.running.get(id);
        if (running) {
            WorkerPool.running.delete(id);
            running.request.cell.storeImage(running.zoom, running.version, bitmap);
            running.request.callbacks.forEach((callback) => callback());
        } else {
            bitmap.close();
        }

        WorkerPool.dispatch();
    }
}
