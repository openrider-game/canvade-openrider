import { PhysicsCell } from '../grid/cell/physics-cell';
import { RenderCell } from '../grid/cell/render-cell';
import { Grid } from '../grid/grid';
import { CACHE_CELL_SIZE, GRID_CELL_SIZE } from '../grid/grid.constants';

/**
 * Layer of a track, holding its objects in two grids.
 *
 * The physics grid, with small cells, is used for collisions, erasing and exports. The render
 * cache grid, with larger cells, keeps pre-rendered images of the lines.
 */
export class TrackLayer {
    public readonly grid = new Grid(GRID_CELL_SIZE, PhysicsCell);
    public readonly cache = new Grid(CACHE_CELL_SIZE, RenderCell);

    /**
     * Creates an empty layer.
     *
     * @param opacityFactor - Opacity of the rendered lines, between 0 and 1.
     */
    public constructor(public readonly opacityFactor: number) {}
}
