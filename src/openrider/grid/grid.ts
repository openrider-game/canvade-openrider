import { Vector } from 'canvade';
import type { Item } from '../item/item';
import type { SceneryLine } from '../item/line/scenery-line';
import type { SolidLine } from '../item/line/solid-line';
import type { TrackObject } from '../item/track-object';
import type { Cell } from './cell/cell';
import { CELL_BLOCK_ACTION_OFFSET_ORDER, MAX_SPREAD } from './grid.constants';

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
    /** Cells crossed by each segment, by cell size then by segment ends. */
    private static spreadCache = new Map<number, Map<string, Vector[]>>();

    /** Cells by `x,y` grid coordinates. */
    public readonly cells = new Map<string, T>();

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

    private getKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    public has(x: number, y: number): boolean {
        return this.cells.has(this.getKey(x, y));
    }

    /** Gets the cell at the given grid coordinates, creating it if needed. */
    public cell(x: number, y: number): T {
        const key = this.getKey(x, y);
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

    /**
     * Cells crossed by a segment, created when needed, e.g. to store a line where a command block
     * moves it as well (see `CommandRegistry`).
     */
    public cellsCrossed(from: Vector, to: Vector): T[] {
        return Grid.spread(from, to, this.cellSize).map((vec) => {
            const gridCoords = Grid.gridCoords(vec, this.cellSize);
            return this.cell(gridCoords.x, gridCoords.y);
        });
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

    /**
     * Lists a point in each cell crossed by the segment going from `from` to `to`.
     *
     * The segment is walked from one cell border crossing to the next, the crossings being rounded
     * to integer positions. Results are cached by cell size and segment.
     *
     * @returns The start of the segment, then the crossing point entering each next cell.
     */
    private static spread(from: Vector, to: Vector, cellSize: number): Vector[] {
        let currentCache = Grid.spreadCache.get(cellSize);
        if (!currentCache) {
            currentCache = new Map();
            Grid.spreadCache.set(cellSize, currentCache);
        }

        const key = `${from};${to}`;
        const cached = currentCache.get(key);
        if (cached) {
            return cached;
        }

        if (from.x === to.x && from.y === to.y) {
            const single = [new Vector(from.x, from.y)];
            currentCache.set(key, single);
            return single;
        }

        const currentLineCache: Vector[] = [];
        currentCache.set(key, currentLineCache);

        const getFirstGridCoord = (sign: number, coord: number): number => {
            if (sign < 0) {
                return Math.round(Math.ceil((coord + 1) / cellSize + sign) * cellSize) - 1;
            }
            return Math.round(Math.floor(coord / cellSize + sign) * cellSize);
        };

        let current = from.clone();
        const factor = (to.y - current.y) / (to.x - current.x);
        const signX = from.x < to.x ? 1 : -1;
        const signY = from.y < to.y ? 1 : -1;

        currentLineCache.push(from);

        const toGrid = Grid.gridCoords(to, cellSize);

        for (let i = 0; i < MAX_SPREAD; i++) {
            const fromGrid = Grid.gridCoords(current, cellSize);
            if (fromGrid.x === toGrid.x && fromGrid.y === toGrid.y) {
                break;
            }

            // Next crossings of a vertical and of a horizontal cell border, keeping the closest
            const to1X = getFirstGridCoord(signX, current.x);
            const to1Y = Math.round(from.y + (to1X - from.x) * factor);
            const to1 = new Vector(to1X, to1Y);

            const to2Y = getFirstGridCoord(signY, current.y);
            const to2X = Math.round(from.x + (to2Y - from.y) / factor);
            const to2 = new Vector(to2X, to2Y);

            const diff1 = from.sub(to1);
            const diff2 = from.sub(to2);
            if (diff1.x ** 2 + diff1.y ** 2 < diff2.x ** 2 + diff2.y ** 2) {
                current = to1;
            } else {
                current = to2;
            }

            currentLineCache.push(current);
        }

        return currentLineCache;
    }
}
