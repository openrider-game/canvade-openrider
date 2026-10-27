import { Display, Vector, World, WorldVector } from 'canvade';
import { BMX } from '../bike/bmx';
import type { BikeRunner } from '../bike/runner/bike-runner';
import type { GhostRunner } from '../bike/runner/ghost-runner';
import type { RemoteRunner } from '../bike/runner/remote-runner';
import type { ReplayRunner } from '../bike/runner/replay-runner';
import { PlayerRunner } from '../bike/runner/player-runner';
import type { Collidable } from '../entity/collidable';
import { Entity } from '../entity/entity';
import type { EraserRestriction } from '../grid/cell/physics-cell';
import { TrackEditor } from '../edit/track-editor';
import { HistoryManager } from '../history/history-manager';
import { CommandRegistry } from '../item/command/command-registry';
import { Line } from '../item/line/line';
import type { ReachableItem } from '../item/reachable-item';
import type { Target } from '../item/reachable/target';
import type { TrackObject } from '../item/track-object';
import { ToolCollection } from '../tool/tool-collection';
import { ToolManager } from '../tool/tool-manager';
import { DebugOptions, defaultDebugOptions } from './debug-options';
import { LayerStack } from './layer-stack';
import { DEFAULT_ZOOM, MAX_LINE_LENGTH, MIN_LINE_LENGTH } from './track.constants';
import { Zoom } from './zoom';
import type { TrackLayer } from './track-layer';

/** Rider the camera follows other than the player: a rider of the live session, or a ghost. */
export type FollowedRider = { kind: 'remote'; id: string } | { kind: 'ghost'; id: number };

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
    /** Rider the camera follows, see {@link Track.follow}. */
    private followedRider: FollowedRider | null = null;
    /** Bike part of the followed rider the camera was last given. */
    private followedPoint: Entity | null = null;

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
    /** Command blocks of the track and the objects of their areas. */
    public readonly commands = new CommandRegistry(this);
    /**
     * Whether the track is being edited: the command blocks then show what they act on, and the
     * objects they hide are drawn faded.
     */
    public editing = false;
    /** View zoom a command block eases the view to, null once reached. */
    public zoomTarget: number | null = null;
    /** Point a command block shows instead of the focal point, until a physics tick. */
    public cameraHold: { pos: Vector; until: number } | null = null;
    /**
     * Called when a runner starts a run, its bike at the start or at a checkpoint, before its
     * first physics tick: e.g. for the endurance course to follow it.
     */
    public onRunnerStart: ((runner: BikeRunner) => void) | null = null;
    /**
     * Called after each physics tick of a rider of the live session, who rides at their own pace
     * (see `RemoteRunner.advance`): e.g. for the endurance course to follow them.
     */
    public onRemoteTick: ((runner: RemoteRunner) => void) | null = null;
    /**
     * Retires the run of the player while riding, ending it now as if the rider crashed: set by
     * the modes saving runs that can get stuck, e.g. the endurance mode (see `RetireTool`).
     */
    public retireRun: (() => void) | null = null;
    public toolCollection = new ToolCollection();
    public readonly toolManager = new ToolManager(this);
    /** Edits of the track in the editor, kept by its history. */
    public readonly editor = new TrackEditor(this);
    public readonly history = new HistoryManager((edit) => this.editor.replay(edit));

    public paused = false;

    public readonly playerRunner: PlayerRunner;
    public ghostRunners = new Map<number, GhostRunner>();
    /**
     * Riders of the live session, by id: they ride at their own pace, the restarts and the
     * checkpoints of the player leaving them alone.
     */
    public readonly remoteRunners = new Map<string, RemoteRunner>();
    /** Downloaded ghost codes by ghost id. */
    public readonly ghostCache = new Map<number, string>();

    /** Whether the debug mode is enabled, its overlays chosen in {@link Track.debugOptions}. */
    public debug = false;
    public readonly debugOptions: DebugOptions = defaultDebugOptions();
    /** Whether the controls panel is open, to bind the controls to other keys. */
    public controlsOpen = false;
    /** Physics ticks to run while paused, requested by {@link Track.step}. */
    public pendingSteps = 0;

    /** Device pixels per CSS pixel of the screen, the track being drawn in device pixels. */
    public pixelRatio: number;

    /** Canvas the track is rendered on, known after the first render. */
    public canvas: HTMLCanvasElement | null = null;

    /**
     * Creates an empty track.
     *
     * @param id - Id of the track when racing it, null when editing.
     */
    public constructor(public id: number | null = null) {
        super(new Vector(), Zoom.toPixel(DEFAULT_ZOOM, Display.pixelRatio));
        this.pixelRatio = Display.pixelRatio;

        this.playerRunner = new PlayerRunner(this, BMX);
    }

    /**
     * Elapsed physics ticks since the start of the run of the player: the time shown, and the one
     * of the view commands. Every runner counts its own (`BikeRunner.time`).
     */
    public get time(): number {
        return this.playerRunner.time;
    }

    /** Width of the canvas, in pixels, 0 before the first render. */
    public get viewWidth(): number {
        return this.canvas?.width ?? 0;
    }

    /** Height of the canvas, in pixels, 0 before the first render. */
    public get viewHeight(): number {
        return this.canvas?.height ?? 0;
    }

    /**
     * Zoom chosen by the player, in CSS pixels per world unit, `zoomFactor` being the pixel zoom
     * the track is drawn at (see {@link Zoom}).
     */
    public get viewZoom(): number {
        return Zoom.toView(this.zoomFactor, this.pixelRatio);
    }

    /**
     * Follows the pixel ratio of the screen, keeping the view zoom: the track keeps its size on
     * the screen, drawn at its full resolution.
     */
    public setPixelRatio(pixelRatio: number): void {
        if (pixelRatio !== this.pixelRatio) {
            const viewZoom = this.viewZoom;
            this.pixelRatio = pixelRatio;
            this.zoomFactor = Zoom.toPixel(viewZoom, pixelRatio);
        }
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
     * Zooms in or out by steps of the view zoom, keeping the given point at the same place on the
     * canvas.
     *
     * @param point - World position to zoom at.
     * @param direction - Number of zoom steps, positive to zoom in, negative to zoom out.
     */
    public zoomAt(point: Vector, direction: number): void {
        // The player takes the zoom back from the command blocks
        this.zoomTarget = null;
        const pixel = this.toPixel(point);
        this.zoomFactor = Zoom.toPixel(Zoom.step(this.viewZoom, direction), this.pixelRatio);
        this.camera.x = point.x - (pixel.x - this.viewWidth / 2) / this.zoomFactor;
        this.camera.y = point.y - (pixel.y - this.viewHeight / 2) / this.zoomFactor;
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
     * The objects bound to a command block stay out of the render cache, drawn by their block:
     * an object is in the render cache while it is on the track and bound to no block.
     *
     * @throws If the object is not placed on a layer.
     */
    public add(obj: TrackObject): void {
        // Lines too short or too long are kept in the totals but never collide nor render
        if (!(obj instanceof Line) || (obj.len >= MIN_LINE_LENGTH && obj.len < MAX_LINE_LENGTH)) {
            const layer = this.getLayer(obj);
            layer.grid.add(obj);
            if (obj.command === null) {
                layer.cache.add(obj);
            }
        }
        this.commands.objectChanged(obj);
        this.editor.added(obj);
    }

    /**
     * Removes an object from the grids of its layer, called by {@link TrackObject.removeFromTrack}.
     *
     * @throws If the object is not placed on a layer.
     */
    public remove(obj: TrackObject): void {
        const layer = this.getLayer(obj);
        layer.grid.remove(obj);
        if (obj.command === null) {
            layer.cache.remove(obj);
        }
        this.commands.objectChanged(obj);
        this.editor.removed(obj);
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
     * cells collides only once. The main layers are checked in stack order, which the recorded
     * ghosts depend on.
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
        // The view commands of the last run end with it
        this.cameraHold = null;

        this.playerRunner.restart();
        this.ghostRunners.forEach((runner) => runner.restart());

        this.updateFocalPoint();
    }

    /** Rider the camera follows other than the player, null when none. */
    public get followed(): FollowedRider | null {
        return this.followedRider;
    }

    /** Runner of a followed rider, undefined once gone (left the session, ghost removed). */
    public runnerOf(rider: FollowedRider): ReplayRunner | undefined {
        return rider.kind === 'remote'
            ? this.remoteRunners.get(rider.id)
            : this.ghostRunners.get(rider.id);
    }

    /**
     * Follows a rider with the camera, whatever bike they ride: their bike changes whenever they
     * start over, and the runner of a rider of the live session when their run is sent again.
     * The camera follows the player again with null, or when the rider is gone.
     *
     * Following stops as soon as something else moves the camera: the player riding (see
     * `PlayerRunner`), or the camera being dragged.
     */
    public follow(rider: FollowedRider | null): void {
        this.followedRider = rider;
        this.followedPoint = null;
        if (rider) {
            this.refreshFocalPoint();
        } else {
            this.focalPoint = this.playerRunner.instance?.hitbox ?? null;
        }
    }

    /** Points the camera at the current bike of the followed rider, on each frame. */
    public refreshFocalPoint(): void {
        const rider = this.followedRider;
        if (!rider) {
            return;
        }
        // Something else moved the camera
        if (this.followedPoint !== null && this.focalPoint !== this.followedPoint) {
            this.followedRider = null;
            this.followedPoint = null;
            return;
        }

        const runner = this.runnerOf(rider);
        if (!runner) {
            this.follow(null);
            return;
        }
        // An exploded bike is gone: the camera stays where it was
        const point = runner.instance?.hitbox ?? this.followedPoint;
        this.focalPoint = this.followedPoint = point;
    }

    /**
     * Focuses the camera on the player, or on the first ghost if the player has not reached any
     * checkpoint, to watch the best run: the player takes the camera back by riding (see
     * `PlayerRunner`). The endurance mode, without checkpoints, follows the first ghost until
     * then on each start.
     *
     * A rider of the live session followed stays followed: they ride on whatever the player does.
     */
    public updateFocalPoint(): void {
        if (this.followedRider?.kind === 'remote') {
            this.refreshFocalPoint();
            return;
        }
        this.followedRider = null;
        this.followedPoint = null;

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
