import { Vector } from 'canvade';
import type { Item } from '../item/item';
import type { SceneryLine } from '../item/line/scenery-line';
import type { SolidLine } from '../item/line/solid-line';
import type { TrackObject } from '../item/track-object';
import type { Cell } from './cell/cell';
import { CELL_BLOCK_ACTION_OFFSET_ORDER, MAX_SPREAD } from './grid.constants';

/**
 * Span of the grid coordinates packed into a number key (see {@link Grid.cellKey}): from
 * `-KEY_OFFSET` to `KEY_OFFSET - 1` on each axis, billions of world units, the packed keys
 * staying safe integers.
 */
const KEY_SPAN = 2 ** 26,
    KEY_OFFSET = 2 ** 25;

/** Constructor of a grid cell, taking its world position and size. */
export interface CellClass<T extends Cell> {
    new (x: number, y: number, size: number): T;
}

/**
 * Sparse grid of cells, each track object being stored in every cell it goes through.
 *
 * Each track layer has two grids of the same objects: a physics grid of `PhysicsCell` used
 * for collisions, erasing and exports, and a render cache grid of larger `RenderCell`
 * keeping pre-rendered images of the lines and the item sprites. Cells are created on demand.
 *
 * An item is stored in the cell of its position, except in the render grids, where an item drawn
 * as a sprite is stored in every cell its sprite reaches (see `ITEM_SPRITE_MARGIN`).
 */
export class Grid<T extends Cell> {
    /** Cells by grid coordinates, see {@link Grid.cellKey}. */
    public readonly cells = new Map<number | string, T>();

    /**
     * Objects of the layer by id, including the lines too short or too long to be stored in the
     * cells. Only maintained on the physics grid.
     */
    public readonly totalSolidLines = new Map<number, SolidLine>();
    public readonly totalSceneryLines = new Map<number, SceneryLine>();
    public readonly totalObjects = new Map<number, Item>();

    /**
     * Creates an empty grid.
     *
     * @param cellSize - Size of the cells, in world units.
     * @param spriteMargin - Distance around an item sprite stored in the cells it reaches, 0
     * to store the items in the cell of their position only.
     */
    public constructor(
        public readonly cellSize: number,
        private readonly cellClass: CellClass<T>,
        private readonly spriteMargin = 0,
    ) {}

    /**
     * Key of a cell by its grid coordinates: both packed into a number, faster to look up than a
     * string and allocating nothing, or `x,y` past the span of the packed keys, e.g. for the
     * absurd coordinates of a malformed track, so that two cells never share a key.
     */
    private static cellKey(x: number, y: number): number | string {
        if (x >= -KEY_OFFSET && x < KEY_OFFSET && y >= -KEY_OFFSET && y < KEY_OFFSET) {
            return (x + KEY_OFFSET) * KEY_SPAN + (y + KEY_OFFSET);
        }
        return `${x},${y}`;
    }

    public has(x: number, y: number): boolean {
        return this.cells.has(Grid.cellKey(x, y));
    }

    /** Gets the cell at the given grid coordinates, creating it if needed. */
    public cell(x: number, y: number): T {
        const key = Grid.cellKey(x, y);
        let cell = this.cells.get(key);

        if (!cell) {
            cell = new this.cellClass(x * this.cellSize, y * this.cellSize, this.cellSize);
            this.cells.set(key, cell);
        }

        return cell;
    }

    /** Stores the object in every cell it crosses. */
    public add(obj: TrackObject): void {
        this.getCellsForObject(obj).forEach((cell) => cell.push(obj));
    }

    /** Removes the object from every cell it crosses. */
    public remove(obj: TrackObject): void {
        this.getCellsForObject(obj).forEach((cell) => cell.remove(obj));
    }

    private getCellsForObject(obj: TrackObject): T[] {
        if (this.spriteMargin > 0 && obj.kind === 'item' && (obj as Item).sprite !== null) {
            return this.cellsAround(obj.pos, this.spriteMargin);
        }
        return this.cellsCrossed(obj.pos, obj.endPos);
    }

    /** Cells within a distance of a position on each axis, created when needed. */
    private cellsAround(pos: Vector, margin: number): T[] {
        const from = Grid.gridCoords(new Vector(pos.x - margin, pos.y - margin), this.cellSize);
        const to = Grid.gridCoords(new Vector(pos.x + margin, pos.y + margin), this.cellSize);
        const cells: T[] = [];
        for (let x = from.x; x <= to.x; x++) {
            for (let y = from.y; y <= to.y; y++) {
                cells.push(this.cell(x, y));
            }
        }
        return cells;
    }

    /** Cell containing a world position, created when needed. */
    private cellAt(x: number, y: number): T {
        return this.cell(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    }

    /**
     * Cells crossed by a segment, created when needed, e.g. to store a line where a command block
     * moves it as well (see `CommandRegistry`).
     *
     * The segment is walked from one cell border crossing to the next, the crossings being rounded
     * to integer positions: the cell of the start, then the cell each crossing enters. Computed
     * again each time rather than cached, which would keep every line of every track.
     */
    public cellsCrossed(from: Vector, to: Vector): T[] {
        const cellSize = this.cellSize;
        const cells = [this.cellAt(from.x, from.y)];
        if (from.x === to.x && from.y === to.y) {
            return cells;
        }

        const firstGridCoord = (sign: number, coord: number): number => {
            if (sign < 0) {
                return Math.round(Math.ceil((coord + 1) / cellSize + sign) * cellSize) - 1;
            }
            return Math.round(Math.floor(coord / cellSize + sign) * cellSize);
        };

        const factor = (to.y - from.y) / (to.x - from.x);
        const signX = from.x < to.x ? 1 : -1;
        const signY = from.y < to.y ? 1 : -1;
        const toX = Math.floor(to.x / cellSize);
        const toY = Math.floor(to.y / cellSize);
        let x = from.x;
        let y = from.y;

        for (let i = 0; i < MAX_SPREAD; i++) {
            if (Math.floor(x / cellSize) === toX && Math.floor(y / cellSize) === toY) {
                break;
            }

            // Next crossings of a vertical and of a horizontal cell border, keeping the closest
            const x1 = firstGridCoord(signX, x);
            const y1 = Math.round(from.y + (x1 - from.x) * factor);
            const y2 = firstGridCoord(signY, y);
            const x2 = Math.round(from.x + (y2 - from.y) / factor);

            const distance1 = (from.x - x1) ** 2 + (from.y - y1) ** 2;
            const distance2 = (from.x - x2) ** 2 + (from.y - y2) ** 2;
            if (distance1 < distance2) {
                x = x1;
                y = y1;
            } else {
                x = x2;
                y = y2;
            }

            cells.push(this.cellAt(x, y));
        }

        return cells;
    }

    /**
     * Runs an action on the 2x2 block of cells starting at the given grid coordinates, in the
     * order of {@link CELL_BLOCK_ACTION_OFFSET_ORDER}.
     */
    public cellBlockAction(x: number, y: number, action: (cell: T) => void): void {
        for (const [offsetX, offsetY] of CELL_BLOCK_ACTION_OFFSET_ORDER) {
            action(this.cell(x + offsetX, y + offsetY));
        }
    }

    /** Converts a world position to the grid coordinates of the cell containing it. */
    public static gridCoords(vec: Vector, cellSize: number): Vector {
        return new Vector(Math.floor(vec.x / cellSize), Math.floor(vec.y / cellSize));
    }
}
