import { Vector } from 'canvade';
import type { BikeRunner } from '../bike/runner/bike-runner';
import { CACHE_CELL_SIZE, GRID_CELL_SIZE } from '../grid/grid.constants';
import type { Track } from './track';
import type { TrackLayer } from './track-layer';
import type { GridBounds } from './track-renderer';

/** Colors of the render cells by state of their image at the current zoom. */
const CELL_STATE_COLORS = {
    current: '#00aa0022',
    stale: '#ff880044',
    'other-zoom': '#ffdd0044',
    none: '#ff000044',
};

/**
 * Draws the debug overlays chosen in the debug options of a track, over the track: grids, render
 * cell states, collision checks and physics of the bikes. The item ids are drawn by the items.
 */
export abstract class TrackDebugRenderer {
    /**
     * Draws the enabled overlays.
     *
     * @param bounds - Visible cells of the render cache grid and of the physics grid.
     * @param layers - Layers whose render cells are tinted, the displayed ones.
     */
    public static render(
        ctx: CanvasRenderingContext2D,
        track: Track,
        bounds: { cache: GridBounds; physics: GridBounds },
        layers: readonly TrackLayer[],
    ): void {
        const debugOptions = track.debugOptions;
        const runners = [
            ...track.remoteRunners.values(),
            ...track.ghostRunners.values(),
            track.playerRunner,
        ];

        ctx.save();
        ctx.lineWidth = 2;

        if (debugOptions.cells) {
            TrackDebugRenderer.renderCellStates(ctx, track, bounds.cache, layers);
        }

        if (debugOptions.grids) {
            ctx.strokeStyle = '#0000ff55';
            TrackDebugRenderer.renderGrid(ctx, track, bounds.cache, CACHE_CELL_SIZE);
            ctx.strokeStyle = '#0000ff22';
            TrackDebugRenderer.renderGrid(ctx, track, bounds.physics, GRID_CELL_SIZE);
        }

        if (debugOptions.collisions) {
            runners.forEach((runner) => TrackDebugRenderer.renderCollisions(ctx, runner));
        }

        if (debugOptions.bikes) {
            runners.forEach((runner) => TrackDebugRenderer.renderBikePhysics(ctx, runner));
        }

        ctx.restore();
    }

    /**
     * Tints the visible render cells by the state of their image at the current zoom: green when
     * up to date, orange when stale, yellow when another zoom level is scaled, red when missing.
     * The cells rendered by the workers show their number of lines.
     */
    private static renderCellStates(
        ctx: CanvasRenderingContext2D,
        track: Track,
        bounds: GridBounds,
        layers: readonly TrackLayer[],
    ): void {
        const zoom = track.zoomFactor;
        const size = CACHE_CELL_SIZE * zoom;

        ctx.font = 'bold 12px monospace';
        for (const layer of layers) {
            for (let x = bounds.topLeft.x; x <= bounds.bottomRight.x; x++) {
                for (let y = bounds.topLeft.y; y <= bounds.bottomRight.y; y++) {
                    if (!layer.cache.has(x, y)) {
                        continue;
                    }

                    const cell = layer.cache.cell(x, y);
                    const pos = track.toPixel(new Vector(cell.x, cell.y));
                    ctx.fillStyle = CELL_STATE_COLORS[cell.imageState(zoom)];
                    ctx.fillRect(pos.x, pos.y, size, size);

                    if (cell.isHeavy()) {
                        ctx.fillStyle = '#000';
                        const lines = cell.lines.length + cell.scenery.length;
                        ctx.fillText(`workers: ${lines} lines`, pos.x + 4, pos.y + 14);
                    }
                }
            }
        }
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

    /** Highlights the physics cells checked around each point of a runner, and their hitboxes. */
    public static renderCollisions(ctx: CanvasRenderingContext2D, runner: BikeRunner): void {
        const track = runner.track;
        const points: Array<{ pos: Vector; displayPos: Vector; size: number; touch: boolean }> = [
            ...(runner.instance?.points ?? []),
            ...(runner.deadObject?.points ?? []),
        ];
        const cellSize = GRID_CELL_SIZE;
        const gridZoom = cellSize * track.zoomFactor;

        for (const point of points) {
            if (!point.touch) {
                continue;
            }

            const x = Math.floor(point.pos.x / cellSize - 0.5);
            const y = Math.floor(point.pos.y / cellSize - 0.5);
            const cellX = Math.floor(
                track.viewWidth / 2 - track.camera.x * track.zoomFactor + x * gridZoom,
            );
            const cellY = Math.floor(
                track.viewHeight / 2 - track.camera.y * track.zoomFactor + y * gridZoom,
            );

            // The 2x2 block of cells checked by the collisions
            ctx.fillStyle = '#ff000005';
            ctx.fillRect(cellX, cellY, gridZoom, gridZoom);
            ctx.fillRect(cellX, cellY + gridZoom, gridZoom, gridZoom);
            ctx.fillRect(cellX + gridZoom, cellY, gridZoom, gridZoom);
            ctx.fillRect(cellX + gridZoom, cellY + gridZoom, gridZoom, gridZoom);

            const bikePos = track.toPixel(point.displayPos);
            ctx.fillStyle = '#00ff0055';
            ctx.beginPath();
            ctx.arc(bikePos.x, bikePos.y, point.size * track.zoomFactor, 0, 2 * Math.PI, true);
            ctx.fill();
        }
    }

    /**
     * Draws the physics of the bike of a runner: its springs, its points with their collision
     * radius (red when they collide), and their velocities magnified 5 times.
     */
    public static renderBikePhysics(ctx: CanvasRenderingContext2D, runner: BikeRunner): void {
        const bike = runner.instance;
        if (!bike) {
            return;
        }

        const track = runner.track;
        ctx.save();
        ctx.lineWidth = 1;

        ctx.strokeStyle = '#a0a';
        ctx.beginPath();
        for (const joint of bike.joints) {
            const a = track.toPixel(joint.a.displayPos);
            const b = track.toPixel(joint.b.displayPos);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();

        for (const point of bike.points) {
            const pos = track.toPixel(point.displayPos);
            const velocityEnd = track.toPixel(point.displayPos.add(point.velocity.scale(5)));

            ctx.strokeStyle = point.touch ? '#f00' : '#888';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, point.size * track.zoomFactor, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.strokeStyle = '#00f';
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(velocityEnd.x, velocityEnd.y);
            ctx.stroke();
        }
        ctx.restore();
    }
}
