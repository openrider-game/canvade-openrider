import { Vector } from 'canvade';
import type { RenderCell } from '../grid/cell/render-cell';
import { Grid } from '../grid/grid';
import { CACHE_CELL_SIZE, GRID_CELL_SIZE } from '../grid/grid.constants';
import { WorkerPool } from '../thread/worker-pool';
import type { Track } from './track';
import type { TrackLayer } from './track-layer';

/** Options of {@link TrackRenderer.render}. */
export interface TrackRenderOptions {
    /** Whether to draw the debug overlay, false by default. */
    debug?: boolean;
    /**
     * Whether the densest cells are rendered by the workers, when the browser supports it by
     * default. Without it, they are rendered synchronously.
     */
    fastRender?: boolean;
    /**
     * Whether the layers hidden in the editor are left out, false by default: the hidden layers
     * are only hidden while editing.
     */
    hideHiddenLayers?: boolean;
}

type RenderOptions = Required<TrackRenderOptions>;

/** Visible area of the track, in grid coordinates. */
interface GridBounds {
    topLeft: Vector;
    bottomRight: Vector;
}

/** Draws a track: its layers, its runners and optionally the debug overlay. */
export abstract class TrackRenderer {
    /**
     * Draws the main layers, then the runners, then the foreground layers over them, each group
     * from the bottom layer to the top one.
     */
    public static render(
        ctx: CanvasRenderingContext2D,
        track: Track,
        renderOptions: TrackRenderOptions = {},
    ): void {
        const options: RenderOptions = {
            debug: false,
            fastRender: WorkerPool.supported,
            hideHiddenLayers: false,
            ...renderOptions,
        };
        const cacheBounds = TrackRenderer.getVisibleCells(track, CACHE_CELL_SIZE);
        const shown = (layer: TrackLayer) => layer.visible || !options.hideHiddenLayers;

        for (const layer of track.layers.main.filter(shown)) {
            TrackRenderer.renderLayer(ctx, track, layer, cacheBounds, options);
        }

        track.ghostRunners.forEach((runner) => runner.render(ctx));
        track.playerRunner.render(ctx);

        for (const layer of track.layers.foreground.filter(shown)) {
            TrackRenderer.renderLayer(ctx, track, layer, cacheBounds, options);
        }

        if (options.debug) {
            TrackRenderer.renderDebug(ctx, track, cacheBounds);
        }
    }

    /** Gets the cells covered by the canvas, for a grid of the given cell size. */
    private static getVisibleCells(track: Track, cellSize: number): GridBounds {
        const topLeft = track.toWorld(new Vector(0, 0));
        const bottomRight = track.toWorld(new Vector(track.viewWidth, track.viewHeight));

        return {
            topLeft: Grid.gridCoords(topLeft, cellSize),
            bottomRight: Grid.gridCoords(bottomRight, cellSize),
        };
    }

    private static renderLayer(
        ctx: CanvasRenderingContext2D,
        track: Track,
        layer: TrackLayer,
        bounds: GridBounds,
        options: RenderOptions,
    ): void {
        for (let x = bounds.topLeft.x; x <= bounds.bottomRight.x; x++) {
            for (let y = bounds.topLeft.y; y <= bounds.bottomRight.y; y++) {
                if (layer.cache.has(x, y)) {
                    TrackRenderer.renderCell(ctx, track, layer, layer.cache.cell(x, y), options);
                }
            }
        }
    }

    /**
     * Draws the cached image of a cell, then the items of the cell.
     *
     * The image is drawn 1px up and left, as cells bleed by 1px on each side. While the image at
     * the current zoom is rendering, an image of another zoom is scaled to it.
     *
     * @see {@link RenderCell.getImage}
     */
    private static renderCell(
        ctx: CanvasRenderingContext2D,
        track: Track,
        layer: TrackLayer,
        cell: RenderCell,
        options: RenderOptions,
    ): void {
        const zoom = track.zoomFactor;
        const image = cell.getImage(zoom, layer.opacityFactor, options.fastRender);

        if (image) {
            const x = Math.floor(track.viewWidth / 2 - track.camera.x * zoom + cell.x * zoom) - 1;
            const y = Math.floor(track.viewHeight / 2 - track.camera.y * zoom + cell.y * zoom) - 1;

            if (image.zoom === zoom) {
                ctx.drawImage(image.source, x, y);
            } else {
                const scale = zoom / image.zoom;
                ctx.drawImage(
                    image.source,
                    x,
                    y,
                    image.source.width * scale,
                    image.source.height * scale,
                );
            }
        }

        ctx.strokeStyle = '#000';
        for (const object of cell.objects) {
            object.render(ctx);
            if (options.debug) {
                object.renderDebug(ctx);
            }
        }
    }

    /** Draws the render and physics grids, and the collision checks of the runners. */
    private static renderDebug(
        ctx: CanvasRenderingContext2D,
        track: Track,
        cacheBounds: GridBounds,
    ): void {
        const physicsCellSize = GRID_CELL_SIZE;
        const physicsBounds = TrackRenderer.getVisibleCells(track, physicsCellSize);

        ctx.save();
        ctx.lineWidth = 2;

        ctx.strokeStyle = '#0000ff55';
        TrackRenderer.renderGrid(ctx, track, cacheBounds, CACHE_CELL_SIZE);

        ctx.strokeStyle = '#0000ff22';
        TrackRenderer.renderGrid(ctx, track, physicsBounds, physicsCellSize);

        track.ghostRunners.forEach((runner) => runner.renderDebug(ctx));
        track.playerRunner.renderDebug(ctx);

        ctx.restore();
    }

    private static renderGrid(
        ctx: CanvasRenderingContext2D,
        track: Track,
        bounds: GridBounds,
        cellSize: number,
    ): void {
        const zoom = track.zoomFactor;

        ctx.beginPath();
        for (let y = bounds.topLeft.y; y <= bounds.bottomRight.y; y++) {
            const gridLineY = Math.floor(
                track.viewHeight / 2 - track.camera.y * zoom + y * cellSize * zoom,
            );
            ctx.moveTo(0, gridLineY);
            ctx.lineTo(track.viewWidth, gridLineY);
        }

        for (let x = bounds.topLeft.x; x <= bounds.bottomRight.x; x++) {
            const gridLineX = Math.floor(
                track.viewWidth / 2 - track.camera.x * zoom + x * cellSize * zoom,
            );
            ctx.moveTo(gridLineX, 0);
            ctx.lineTo(gridLineX, track.viewHeight);
        }
        ctx.stroke();
    }
}
