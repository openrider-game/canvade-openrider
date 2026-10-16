/**
 * Body of the render workers.
 *
 * It is serialized with `toString()` to create the workers from a blob, so it must stay
 * self-contained: no imports nor outer references. Each cell is rendered on an offscreen canvas
 * like `RenderCell` does on the main thread, and sent back as an image bitmap.
 */
export function renderCellWorker(): void {
    interface WorkerScope {
        postMessage(message: unknown, transfer: Transferable[]): void;
        addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
    }

    const scope = self as unknown as WorkerScope;

    scope.addEventListener('message', (e: MessageEvent) => {
        const { id, task } = e.data;
        const zoom: number = task.zoom;

        // Cells bleed by 1px on each side to avoid thin seams between adjacent cells. The size is
        // truncated like the size of a canvas element.
        const size = Math.max(1, Math.floor(task.cellSize * zoom + 2));
        const canvas = new OffscreenCanvas(size, size);
        const context = canvas.getContext('2d');

        if (context) {
            const offsetLeft = task.x * zoom - 1;
            const offsetTop = task.y * zoom - 1;

            const drawLines = (buffer: ArrayBuffer) => {
                const lines = new Int32Array(buffer);
                for (let i = 0; i < lines.length - 3; i += 4) {
                    context.beginPath();
                    context.moveTo(lines[i] * zoom - offsetLeft, lines[i + 1] * zoom - offsetTop);
                    context.lineTo(
                        lines[i + 2] * zoom - offsetLeft,
                        lines[i + 3] * zoom - offsetTop,
                    );
                    context.stroke();
                }
            };

            context.lineCap = 'round';
            context.lineWidth = Math.max(2 * zoom, 0.5);
            context.globalAlpha = task.opacityFactor;

            context.strokeStyle = '#aaa';
            drawLines(task.sceneryBuffer);
            context.strokeStyle = '#000';
            drawLines(task.lineBuffer);
        }

        const bitmap = canvas.transferToImageBitmap();
        scope.postMessage({ id, bitmap }, [bitmap]);
    });
}
