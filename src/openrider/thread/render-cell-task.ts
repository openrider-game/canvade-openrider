import type { RenderCell } from '../grid/cell/render-cell';

/**
 * Data sent to a worker to render a cell.
 *
 * Lines are flattened as [x1, y1, x2, y2, ...] in an `Int32Array` buffer, in world units, and the
 * item sprites as `packItemSprites` does.
 */
export interface RenderCellDefinition {
    /** Size of the cell, in world units. */
    cellSize: number;
    zoom: number;
    opacityFactor: number;
    /** Left of the cell, in world units. */
    x: number;
    /** Top of the cell, in world units. */
    y: number;
    sceneryBuffer: ArrayBuffer;
    lineBuffer: ArrayBuffer;
    spriteBuffer: ArrayBuffer;
    /** Fill colors of the sprites, by their color index. */
    spriteColors: string[];
}

/**
 * Snapshot of the lines and sprites of a cell, taken when the task is sent to a worker.
 *
 * The buffers are transferred to the worker, so the task cannot be sent twice.
 */
export class RenderCellTask {
    public readonly definition: RenderCellDefinition;
    /** Buffers moved to the worker instead of being copied. */
    public readonly transferables: Transferable[];
    /** Version of the cell content the task renders. */
    public readonly version: number;

    public constructor(cell: RenderCell, zoom: number, opacityFactor: number) {
        const sceneryBuffer = RenderCellTask.createBuffer(cell.scenery);
        const lineBuffer = RenderCellTask.createBuffer(cell.lines);
        // A copy, moved to the worker: the cell keeps its sprites for the other zoom levels
        const sprites = { ...cell.packedSprites, buffer: cell.packedSprites.buffer.slice(0) };

        this.version = cell.contentVersion;
        this.definition = {
            cellSize: cell.size,
            zoom,
            opacityFactor,
            x: cell.x,
            y: cell.y,
            sceneryBuffer,
            lineBuffer,
            spriteBuffer: sprites.buffer,
            spriteColors: sprites.colors,
        };

        this.transferables = [sceneryBuffer, lineBuffer, sprites.buffer];
    }

    private static createBuffer(lines: RenderCell['lines'] | RenderCell['scenery']): ArrayBuffer {
        const coordinates = lines.flatMap((line) => [
            line.pos.x,
            line.pos.y,
            line.endPos.x,
            line.endPos.y,
        ]);

        return new Int32Array(coordinates).buffer;
    }
}
