import { Vector } from 'canvade';
import type { RenderCell } from '../grid/cell/render-cell';
import { Grid } from '../grid/grid';
import { CACHE_CELL_SIZE, GRID_CELL_SIZE } from '../grid/grid.constants';
import { WorkerPool } from '../thread/worker-pool';
import type { Track } from './track';
import { TrackDebugRenderer } from './track-debug-renderer';
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
export interface GridBounds {
    topLeft: Vector;
    bottomRight: Vector;
}

/** Draws a track: its layers, its runners and optionally the debug overlays. */
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
        // The objects the command blocks act on, after the objects added or removed since
        track.commands.refresh();

        for (const layer of track.layers.main.filter(shown)) {
            TrackRenderer.renderLayer(ctx, track, layer, cacheBounds, options);
        }

        track.ghostRunners.forEach((runner) => runner.render(ctx));
        track.playerRunner.render(ctx);

        for (const layer of track.layers.foreground.filter(shown)) {
            TrackRenderer.renderLayer(ctx, track, layer, cacheBounds, options);
        }

        if (options.debug) {
            TrackDebugRenderer.render(
                ctx,
                track,
                {
                    cache: cacheBounds,
                    physics: TrackRenderer.getVisibleCells(track, GRID_CELL_SIZE),
                },
                track.layers.all.filter(shown),
            );
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
        // Out of the cached images, as they change with the runners
        track.commands.render(ctx, layer, options.fastRender);
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
        const image = cell.getImage(
            zoom,
            layer.opacityFactor,
            options.fastRender,
            track.pixelRatio,
        );

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
            if (options.debug && track.debugOptions.objects) {
                object.renderDebug(ctx);
            }
        }
    }
}
