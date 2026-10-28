import type { RenderCell } from '../grid/cell/render-cell';
import type { CellDrawing } from '../render/painter';

/** Data sent to a worker to render a cell, drawn by its painter (see `createPainter`). */
export interface RenderCellDefinition {
    /** Size of the cell, in world units. */
    cellSize: number;
    drawing: CellDrawing;
}

/**
 * Snapshot of the lines and sprites of a cell, taken when the task is sent to a worker.
 *
 * The buffers are copies transferred to the worker, so the task cannot be sent twice: the cell
 * keeps its own for the other zoom levels.
 */
export class RenderCellTask {
    public readonly definition: RenderCellDefinition;
    /** Buffers moved to the worker instead of being copied. */
    public readonly transferables: Transferable[];
    /** Version of the cell content the task renders. */
    public readonly version: number;

    public constructor(cell: RenderCell, zoom: number, opacityFactor: number) {
        const drawing = cell.drawing(zoom, opacityFactor);
        const scenery = drawing.scenery.slice();
        const lines = drawing.lines.slice();
        const sprites = drawing.sprites.slice();

        this.version = cell.contentVersion;
        this.definition = {
            cellSize: cell.size,
            drawing: { ...drawing, scenery, lines, sprites },
        };
        this.transferables = [scenery.buffer, lines.buffer, sprites.buffer];
    }
}
