import { Vector } from 'canvade';
import { HatchOptions, HatchResult, HatchSegment } from './hatch';

/** Most cells of the grid an area is searched on: past it, the cells grow instead. */
export const MAX_AREA_CELLS = 4_000_000;

/** State of a cell of the grid: crossed by a line, or reached from the click. */
const OUTSIDE = 0,
    WALL = 1,
    INSIDE = 2;

/**
 * Area closed by lines around a point, found on a grid of square cells: the cells crossed by a
 * line are walls, and the cells reached from the point without crossing one are inside.
 */
export interface EnclosedArea {
    /** Side of a cell, in world units. */
    cell: number;
    /** World position of the corner of the first cell. */
    origin: Vector;
    columns: number;
    rows: number;
    /** State of each cell, row by row. */
    cells: Uint8Array;
    /** Cells inside: the first and last column and row holding one. */
    inside: { minColumn: number; maxColumn: number; minRow: number; maxRow: number };
}

/** Why no area was found: the point is on a line, or the area is not closed within the window. */
export type EnclosedAreaError = 'on-line' | 'open';

/**
 * The lines closing the areas drawn on a grid of square cells, within a window: each cell crossed
 * by a line is a wall. Made once for the lines and the window, then flooded from any point (see
 * {@link floodArea}), e.g. under the pointer.
 */
export interface WallGrid {
    /** Side of a cell, in world units. */
    cell: number;
    /** World position of the corner of the first cell. */
    origin: Vector;
    columns: number;
    rows: number;
    /** Whether each cell is a wall, row by row. */
    walls: Uint8Array;
}

/**
 * Draws the lines closing the areas on a grid covering a window.
 *
 * @param cell - Side of a cell, in world units, made larger when the window would have more than
 *   {@link MAX_AREA_CELLS} cells.
 */
export function wallGrid(
    walls: readonly HatchSegment[],
    window: { min: Vector; max: Vector },
    cell: number,
): WallGrid {
    const width = window.max.x - window.min.x;
    const height = window.max.y - window.min.y;
    cell = Math.max(cell, Math.sqrt((width * height) / MAX_AREA_CELLS));
    const columns = Math.max(3, Math.ceil(width / cell));
    const rows = Math.max(3, Math.ceil(height / cell));
    const origin = window.min.clone();
    const cells = new Uint8Array(columns * rows);
    for (const [a, b] of walls) {
        markLine(cells, columns, rows, origin, cell, a, b);
    }
    return { cell, origin, columns, rows, walls: cells };
}

/**
 * Finds the area closed by lines around a point, within a window: the cells reached from the point
 * by their sides without crossing a line (a flood fill on 4 neighbors, which a diagonal line
 * blocks too).
 *
 * Gaps between lines narrower than a cell are closed, as the cells on both sides are walls. An
 * area reaching the edge of the window is open, e.g. a point outside every shape.
 *
 * @param walls - The lines closing the areas.
 * @param cell - Side of a cell, in world units, see {@link wallGrid}.
 */
export function findEnclosedArea(
    walls: readonly HatchSegment[],
    point: Vector,
    window: { min: Vector; max: Vector },
    cell: number,
): EnclosedArea | EnclosedAreaError {
    return floodArea(wallGrid(walls, window, cell), point);
}

/** Finds the area around a point on a grid of walls, see {@link findEnclosedArea}. */
export function floodArea(grid: WallGrid, point: Vector): EnclosedArea | EnclosedAreaError {
    const { cell, origin, columns, rows } = grid;
    const column = Math.floor((point.x - origin.x) / cell);
    const row = Math.floor((point.y - origin.y) / cell);
    if (column <= 0 || row <= 0 || column >= columns - 1 || row >= rows - 1) {
        return 'open';
    }
    if (grid.walls[row * columns + column] === WALL) {
        return 'on-line';
    }

    // A copy, the grid of walls being flooded again from other points
    const cells = grid.walls.slice();
    const inside = { minColumn: column, maxColumn: column, minRow: row, maxRow: row };
    const stack = [row * columns + column];
    cells[stack[0]] = INSIDE;
    while (stack.length) {
        const index = stack.pop()!;
        const c = index % columns;
        const r = (index - c) / columns;
        if (c === 0 || r === 0 || c === columns - 1 || r === rows - 1) {
            // Reached the edge of the window: the area is not closed
            return 'open';
        }
        inside.minColumn = Math.min(inside.minColumn, c);
        inside.maxColumn = Math.max(inside.maxColumn, c);
        inside.minRow = Math.min(inside.minRow, r);
        inside.maxRow = Math.max(inside.maxRow, r);
        for (const next of [index - 1, index + 1, index - columns, index + columns]) {
            if (cells[next] === OUTSIDE) {
                cells[next] = INSIDE;
                stack.push(next);
            }
        }
    }
    return { cell, origin, columns, rows, cells, inside };
}

/** Whether a point is in a cell of an area, e.g. the pointer still in the area found under it. */
export function isInArea(area: EnclosedArea, point: Vector): boolean {
    const column = Math.floor((point.x - area.origin.x) / area.cell);
    const row = Math.floor((point.y - area.origin.y) / area.cell);
    return (
        column >= 0 &&
        row >= 0 &&
        column < area.columns &&
        row < area.rows &&
        area.cells[row * area.columns + column] === INSIDE
    );
}

/** Marks the cells a line crosses within the grid as walls, sampled every half cell. */
function markLine(
    cells: Uint8Array,
    columns: number,
    rows: number,
    origin: Vector,
    cell: number,
    a: Vector,
    b: Vector,
): void {
    // The part of the line within the grid only, a line being up to 100000 units long
    const range = clip(a, b, origin, origin.x + columns * cell, origin.y + rows * cell);
    if (!range) {
        return;
    }
    const [t0, t1] = range;
    const length = a.distanceTo(b) * (t1 - t0);
    const steps = Math.max(1, Math.ceil(length / (cell / 2)));
    for (let i = 0; i <= steps; i++) {
        const t = t0 + ((t1 - t0) * i) / steps;
        const column = Math.floor((a.x + (b.x - a.x) * t - origin.x) / cell);
        const row = Math.floor((a.y + (b.y - a.y) * t - origin.y) / cell);
        if (column >= 0 && row >= 0 && column < columns && row < rows) {
            cells[row * columns + column] = WALL;
        }
    }
}

/** Part of a line within a rectangle, as the range of its parameter, null outside (Liang–Barsky). */
function clip(
    a: Vector,
    b: Vector,
    min: Vector,
    maxX: number,
    maxY: number,
): [number, number] | null {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [p, q] of [
        [-dx, a.x - min.x],
        [dx, maxX - a.x],
        [-dy, a.y - min.y],
        [dy, maxY - a.y],
    ]) {
        if (p === 0) {
            if (q < 0) {
                return null;
            }
        } else if (p < 0) {
            t0 = Math.max(t0, q / p);
        } else {
            t1 = Math.min(t1, q / p);
        }
    }
    return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Fills an area closed by lines with lines, as {@link hatch} fills a polygon: the same rows, at
 * whole multiples of the spacing.
 *
 * Each row is cut where it crosses a line, so that the lines filling the area end exactly on the
 * lines closing it; the grid of the area only tells which pieces are inside. A piece running
 * through a gap closed by the grid, along an open side, stops at the cells outside, to the nearest
 * half cell.
 */
export function hatchEnclosed(
    area: EnclosedArea,
    walls: readonly HatchSegment[],
    options: HatchOptions,
): HatchResult {
    const angles =
        options.pattern === 'cross' ? [options.angle, options.angle + 90] : [options.angle];
    const segments: HatchSegment[] = [];
    for (const angle of angles) {
        const pass = hatchEnclosedPass(
            area,
            walls,
            angle,
            options.spacing,
            options.maxSegments - segments.length,
        );
        if (pass === null) {
            return { segments: [], overflow: true };
        }
        segments.push(...pass);
    }
    return { segments, overflow: false };
}

/** The segments of one direction, null when more than `max`. */
function hatchEnclosedPass(
    area: EnclosedArea,
    walls: readonly HatchSegment[],
    angle: number,
    spacing: number,
    max: number,
): HatchSegment[] | null {
    if (!(spacing > 0)) {
        return [];
    }
    const { cell, origin, columns, cells, inside } = area;
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const turn = (x: number, y: number) => ({ x: x * cos + y * sin, y: -x * sin + y * cos });
    const back = (x: number, y: number) => new Vector(x * cos - y * sin, x * sin + y * cos);

    // The box of the cells inside, a cell wider on each side, turned
    const left = origin.x + (inside.minColumn - 1) * cell;
    const right = origin.x + (inside.maxColumn + 2) * cell;
    const top = origin.y + (inside.minRow - 1) * cell;
    const bottom = origin.y + (inside.maxRow + 2) * cell;
    const box = [turn(left, top), turn(right, top), turn(right, bottom), turn(left, bottom)];
    const minX = Math.min(...box.map((p) => p.x));
    const maxX = Math.max(...box.map((p) => p.x));
    const first = Math.ceil(Math.min(...box.map((p) => p.y)) / spacing);
    const last = Math.floor(Math.max(...box.map((p) => p.y)) / spacing);
    // Far more rows than segments allowed: most rows of the box cross the area, but those near the
    // corners of the turned box, which may miss it
    if (last - first + 1 > 2 * max + 4) {
        return null;
    }

    // The lines near the area, turned
    const near = walls
        .filter(([a, b]) => Math.max(a.x, b.x) >= left && Math.min(a.x, b.x) <= right)
        .filter(([a, b]) => Math.max(a.y, b.y) >= top && Math.min(a.y, b.y) <= bottom)
        .map(([a, b]) => [turn(a.x, a.y), turn(b.x, b.y)]);

    /** State of the cell holding a point of a row, outside the grid being outside. */
    const state = (x: number, y: number): number => {
        const p = back(x, y);
        const column = Math.floor((p.x - origin.x) / cell);
        const row = Math.floor((p.y - origin.y) / cell);
        if (column < 0 || row < 0 || column >= columns || row >= area.rows) {
            return OUTSIDE;
        }
        return cells[row * columns + column];
    };

    const segments: HatchSegment[] = [];
    const step = cell / 2;
    for (let row = first; row <= last; row++) {
        const y = row * spacing;
        // The row cut at each line it crosses, the half-open rule counting a shared end once
        const cuts = [minX, maxX];
        for (const [a, b] of near) {
            if (a.y <= y !== b.y <= y) {
                const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
                if (x > minX && x < maxX) {
                    cuts.push(x);
                }
            }
        }
        cuts.sort((p, q) => p - q);

        for (let i = 0; i + 1 < cuts.length; i++) {
            const [from, to] = [cuts[i], cuts[i + 1]];
            const count = Math.max(1, Math.ceil((to - from) / step));
            const width = (to - from) / count;
            // Runs of samples without a cell outside, kept when one is inside: the cells of the
            // lines are on both sides of them, neither breaking nor starting a run
            let start: number | null = null;
            let hasInside = false;
            const close = (end: number) => {
                if (start !== null && hasInside && end > start) {
                    if (segments.length === max) {
                        return false;
                    }
                    segments.push([back(start, y), back(end, y)]);
                }
                start = null;
                hasInside = false;
                return true;
            };
            for (let s = 0; s < count; s++) {
                const x = from + (s + 0.5) * width;
                const cellState = state(x, y);
                if (cellState === OUTSIDE) {
                    if (!close(from + s * width)) {
                        return null;
                    }
                    continue;
                }
                if (start === null) {
                    start = s === 0 ? from : from + s * width;
                }
                hasInside ||= cellState === INSIDE;
            }
            if (!close(to)) {
                return null;
            }
        }
    }
    return segments;
}
