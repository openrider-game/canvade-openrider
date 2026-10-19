import { PhysicsCell } from '../grid/cell/physics-cell';
import { RenderCell } from '../grid/cell/render-cell';
import { Grid } from '../grid/grid';
import { CACHE_CELL_SIZE, GRID_CELL_SIZE } from '../grid/grid.constants';
import type { TrackObject } from '../item/track-object';

/**
 * Type of a track layer: `main` layers collide with the bikes and are drawn under them,
 * `foreground` layers have no physics and are drawn over the bikes, half transparent.
 */
export type TrackLayerType = 'main' | 'foreground';

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
     * @param type - Fixed for the life of the layer: the cached images depend on its opacity.
     * @param name - Name displayed in the layers panel of the editor.
     * @param visible - Whether the editor displays the layer; hidden layers still collide, are
     * still exported, and are displayed when racing.
     */
    public constructor(
        public readonly type: TrackLayerType,
        public name: string,
        public visible = true,
    ) {}

    /** Whether the objects of the layer collide with the bikes. */
    public get hasPhysics(): boolean {
        return this.type === 'main';
    }

    /** Opacity of the rendered lines, between 0 and 1. */
    public get opacityFactor(): number {
        return this.type === 'main' ? 1 : 0.5;
    }

    /** Every object on the layer: solid lines, scenery lines, then items. */
    public objects(): TrackObject[] {
        return [
            ...this.grid.totalSolidLines.values(),
            ...this.grid.totalSceneryLines.values(),
            ...this.grid.totalObjects.values(),
        ];
    }
}
