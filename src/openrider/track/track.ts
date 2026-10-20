import { Vector, World, WorldVector } from 'canvade';
import { BMX } from '../bike/bmx';
import type { GhostRunner } from '../bike/runner/ghost-runner';
import { PlayerRunner } from '../bike/runner/player-runner';
import type { Collidable } from '../entity/collidable';
import { Entity } from '../entity/entity';
import type { EraserRestriction } from '../grid/cell/physics-cell';
import { HistoryManager } from '../history/history-manager';
import { Line } from '../item/line/line';
import type { ReachableItem } from '../item/reachable-item';
import type { Target } from '../item/reachable/target';
import type { TrackObject } from '../item/track-object';
import { ToolCollection } from '../tool/tool-collection';
import { ToolManager } from '../tool/tool-manager';
import { DebugOptions, defaultDebugOptions } from './debug-options';
import { LayerStack } from './layer-stack';
import {
    DEFAULT_ZOOM,
    MAX_LINE_LENGTH,
    MAX_ZOOM,
    MIN_LINE_LENGTH,
    MIN_ZOOM,
    ZOOM_STEP,
} from './track.constants';
import type { TrackLayer } from './track-layer';

/**
 * Track being edited or raced: its layers, runners, editing tools and view.
 *
 * Positions are in world units, converted to canvas pixels with {@link Track.toPixel} according
 * to the camera and the zoom factor.
 */
export class Track extends World {
    /** Layers of the track, a main and a foreground layer for a new track. */
    public readonly layers = new LayerStack(this);

    /** Start position of the bikes. */
    public readonly origin = new Vector();
    /** Entity the camera follows, if any. */
    public focalPoint: Entity | null = new Entity();

    /** Mouse position, in world units. */
    public readonly realMousePos = new Vector();
    /** Mouse position snapped to the grid, in world units. */
    public mousePos = new Vector();
    /** Snapped mouse position of the last click, in world units. */
    public lastClick = new Vector();
    /** Step of the grid the mouse position snaps to, in world units, 1 when not snapping. */
    public gridDetail = 1;
    /** Whether the mouse is over the track canvas. */
    public mouseIn = false;
    /** Whether the mouse is over the user interface. */
    public uiHovered = false;
    public cursor = 'none';
    /** Set when the tools changed in a way that requires the interface to be rebuilt. */
    public uiInvalidated = false;

    /** Targets of the track by id, all of them must be reached to finish it. */
    public readonly targets = new Map<number, Target>();
    /** Reachable items of the track by id, targets included. */
    public readonly reachables = new Map<number, ReachableItem>();

    public toolCollection = new ToolCollection();
    public readonly toolManager = new ToolManager(this);
    public readonly history = new HistoryManager();

    public paused = false;
    /** Elapsed physics ticks since the start of the run. */
    public time = 0;

    public readonly playerRunner: PlayerRunner;
    public ghostRunners = new Map<number, GhostRunner>();
    /** Downloaded ghost codes by ghost id. */
    public readonly ghostCache = new Map<number, string>();

    /** Whether the debug mode is enabled, its overlays chosen in {@link Track.debugOptions}. */
    public debug = false;
    public readonly debugOptions: DebugOptions = defaultDebugOptions();
    /** Physics ticks to run while paused, requested by {@link Track.step}. */
    public pendingSteps = 0;

    /** Canvas the track is rendered on, known after the first render. */
    public canvas: HTMLCanvasElement | null = null;

    /**
     * Creates an empty track.
     *
     * @param id - Id of the track when racing it, null when editing.
     */
    public constructor(public id: number | null = null) {
        super(new Vector(), DEFAULT_ZOOM);

        this.playerRunner = new PlayerRunner(this, BMX);
    }

    /** Width of the canvas, in pixels, 0 before the first render. */
    public get viewWidth(): number {
        return this.canvas?.width ?? 0;
    }

    /** Height of the canvas, in pixels, 0 before the first render. */
    public get viewHeight(): number {
        return this.canvas?.height ?? 0;
    }

    public isRace(): boolean {
        return !!this.id;
    }

    /** Converts a world position to a canvas position, in pixels. */
    public toPixel(vec: Vector): Vector {
        return WorldVector.toPixel(vec, this, this.viewWidth, this.viewHeight);
    }

    /** Converts a canvas position, in pixels, to a world position. */
    public toWorld(vec: Vector): Vector {
        return WorldVector.toWorld(vec, this, this.viewWidth, this.viewHeight);
    }

    /**
     * Zooms in or out, keeping the given point at the same place on the canvas.
     *
     * @param point - World position to zoom at.
     * @param direction - Number of zoom steps, positive to zoom in, negative to zoom out.
     */
    public zoomAt(point: Vector, direction: number): void {
        this.zoom(point, direction, this.viewWidth, this.viewHeight, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP);
    }

    /** Syncs the track mouse positions with a world position, snapping it to the grid. */
    public setMousePosition(worldPos: Vector): void {
        this.realMousePos.set(worldPos);
        this.mousePos.x = Math.round(worldPos.x / this.gridDetail) * this.gridDetail;
        this.mousePos.y = Math.round(worldPos.y / this.gridDetail) * this.gridDetail;
    }

    /** Requests the user interface to be rebuilt. */
    public invalidateUI(): void {
        this.uiInvalidated = true;
    }

    /**
     * Stores an object in the grids of its layer, called by {@link TrackObject.addToTrack}.
     *
     * @throws If the object is not placed on a layer.
     */
    public add(obj: TrackObject): void {
        // Lines too short or too long are kept in the totals but never collide nor render
        if (!(obj instanceof Line) || (obj.len >= MIN_LINE_LENGTH && obj.len < MAX_LINE_LENGTH)) {
            const layer = this.getLayer(obj);
            layer.grid.add(obj);
            layer.cache.add(obj);
        }
    }

    /**
     * Removes an object from the grids of its layer, called by {@link TrackObject.removeFromTrack}.
     *
     * @throws If the object is not placed on a layer.
     */
    public remove(obj: TrackObject): void {
        const layer = this.getLayer(obj);
        layer.grid.remove(obj);
        layer.cache.remove(obj);
    }

    private getLayer(obj: TrackObject): TrackLayer {
        if (!obj.layer) {
            throw new Error(`Track object #${obj.id} is not placed on a layer`);
        }

        return obj.layer;
    }

    /**
     * Collides a part with the 2x2 block of physics cells around it, on every main layer from
     * the bottom one to the top one.
     *
     * The touched flags of the whole block are cleared first, so that a line spanning several
     * cells collides only once. With a single main layer, as in the tracks of the original game,
     * the collisions run exactly as in the original game.
     */
    public touch(part: Collidable): void {
        for (const layer of this.layers.main) {
            const grid = layer.grid;
            const x = Math.floor(part.pos.x / grid.cellSize - 0.5);
            const y = Math.floor(part.pos.y / grid.cellSize - 0.5);

            grid.cellBlockAction(x, y, (cell) => cell.untouch());
            grid.cellBlockAction(x, y, (cell) => cell.touch(part));
        }
    }

    /**
     * Deletes the objects of the allowed kinds around the eraser, on the given layers.
     *
     * @param eraserPoint - Eraser center, in world units.
     * @param radius - Eraser radius, in world units.
     * @returns The deleted objects.
     */
    public checkDelete(
        eraserPoint: Vector,
        radius: number,
        restrict: EraserRestriction,
        layers: readonly TrackLayer[],
    ): TrackObject[] {
        const deleted: TrackObject[] = [];
        if (!Object.values(restrict).some(Boolean)) {
            return deleted;
        }

        for (const layer of layers) {
            const x = Math.floor(eraserPoint.x / layer.grid.cellSize - 0.5);
            const y = Math.floor(eraserPoint.y / layer.grid.cellSize - 0.5);
            layer.grid.cellBlockAction(x, y, (cell) => {
                deleted.push(...cell.checkDelete(eraserPoint, radius, restrict));
            });
        }

        return deleted;
    }

    private unreachEverything(): void {
        for (const layer of this.layers.all) {
            layer.grid.cells.forEach((cell) => {
                for (const object of cell.objects) {
                    object.resetReached();
                }
            });
        }
    }

    public pause(paused: boolean): void {
        this.paused = paused;
    }

    /** Pauses the track if needed, then requests a single physics tick, to debug frame by frame. */
    public step(): void {
        this.pause(true);
        this.pendingSteps++;
    }

    /** Restarts the runners from their last checkpoint or from the start, resetting the items. */
    public restart(): void {
        this.unreachEverything();
        this.pause(false);

        this.playerRunner.restart();
        this.ghostRunners.forEach((runner) => runner.restart());

        this.updateFocalPoint();
    }

    /**
     * Focuses the camera on the player, or on the first ghost if the player has not reached any
     * checkpoint.
     */
    public updateFocalPoint(): void {
        let focalPoint = this.playerRunner.instance?.hitbox ?? null;
        if (!this.playerRunner.snapshots.length && this.ghostRunners.size) {
            const firstGhost = this.ghostRunners.values().next().value;
            focalPoint = firstGhost?.instance?.hitbox ?? focalPoint;
        }

        this.focalPoint = focalPoint;
        if (focalPoint) {
            this.camera.set(focalPoint.displayPos);
        }
    }
}
