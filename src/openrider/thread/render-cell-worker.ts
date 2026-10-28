import type { Painter } from '../render/painter';

/**
 * Body of the render workers.
 *
 * It is serialized with `toString()` to create the workers from a blob, so it must stay
 * self-contained: no imports nor outer references, but the painter set on the worker scope by
 * the blob, created as on the main thread (see `WorkerPool`). Each cell is drawn on an offscreen
 * canvas as `RenderCell` does on the main thread, and sent back as an image bitmap.
 */
export function renderCellWorker(): void {
    interface WorkerScope {
        postMessage(message: unknown, transfer: Transferable[]): void;
        addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
        painter: Painter;
    }

    const scope = self as unknown as WorkerScope;

    scope.addEventListener('message', (e: MessageEvent) => {
        const { id, task } = e.data;
        // Cells bleed by 1px on each side to avoid thin seams between adjacent cells. The size is
        // truncated like the size of a canvas element.
        const size = Math.max(1, Math.floor(task.cellSize * task.drawing.zoom + 2));
        const canvas = new OffscreenCanvas(size, size);
        const context = canvas.getContext('2d');
        if (context) {
            scope.painter.drawCell(context, task.drawing);
        }

        const bitmap = canvas.transferToImageBitmap();
        scope.postMessage({ id, bitmap }, [bitmap]);
    });
}
