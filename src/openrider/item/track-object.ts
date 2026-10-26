import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { PhysicsCell } from '../grid/cell/physics-cell';
import type { Grid } from '../grid/grid';
import type { Track } from '../track/track';
import type { TrackLayer } from '../track/track-layer';
import type { CommandBlock } from './command/command-block';

/** Kind of a track object, deciding in which list of a grid cell it is stored. */
export type TrackObjectKind = 'solid' | 'scenery' | 'item';

/**
 * Anything placed on a track layer: lines and items.
 *
 * Once added, an object is stored in every cell of the layer grids it crosses (see
 * {@link Grid}). Positions are in world units.
 */
export abstract class TrackObject {
    private static nextId = 0;

    public abstract readonly kind: TrackObjectKind;

    /** Unique id, also used as key in the grid totals and in the runners reached sets. */
    public readonly id: number;
    /**
     * Id of the object for the edits of the track, the same on every screen editing it (see
     * `TrackEditor`); null for the objects never edited, e.g. of the endurance tracks.
     */
    public uid: string | null = null;
    public pos: Vector;
    /** End of the object, equal to {@link TrackObject.pos} for objects without length. */
    public endPos: Vector;

    /**
     * Set while generating the track code, to avoid exporting an object twice.
     *
     * Lines connected to an exported line are exported with it as a polyline, and linked items
     * with their group, so they are already recorded when the export reaches them.
     */
    public recorded = false;

    /** Layer the object is placed on, must be set before adding the object to the track. */
    public layer: TrackLayer | null = null;
    /**
     * Whether the object is currently on the track, making {@link TrackObject.addToTrack} and
     * {@link TrackObject.removeFromTrack} idempotent.
     */
    public onTrack = false;
    /**
     * Command block hiding, showing or moving the object when a bike triggers it, null for the
     * objects outside of every command area (see `CommandRegistry`).
     */
    public command: CommandBlock | null = null;
    /**
     * Rank of the object in a track generated around the bikes (see `EnduranceCourse`): the grid
     * cells keep their objects in that order, whatever the order they are added in, which the
     * collisions depend on. Null to keep the order of addition, as on the other tracks.
     */
    public order: number | null = null;

    public constructor(
        pos: Vector,
        public readonly track: Track,
    ) {
        this.id = TrackObject.nextId++;
        this.pos = pos;
        this.endPos = pos;
    }

    /**
     * Physics grid of the layer, which also holds the totals of the layer objects.
     *
     * @throws If the object is not placed on a layer.
     */
    public get grid(): Grid<PhysicsCell> {
        if (!this.layer) {
            throw new Error(`Track object #${this.id} is not placed on a layer`);
        }

        return this.layer.grid;
    }

    /** Adds the object to the grids of its layer, does nothing if it is already on the track. */
    public addToTrack(): void {
        if (this.onTrack) {
            return;
        }

        this.onTrack = true;
        this.track.add(this);
        this.onAdd();
    }

    /** Removes the object from the grids of its layer, does nothing if it is not on the track. */
    public removeFromTrack(): void {
        if (!this.onTrack) {
            return;
        }

        this.onTrack = false;
        this.track.remove(this);
        this.onDelete();
    }

    /**
     * Removes the object if it is within the eraser radius.
     *
     * @param eraserPoint - Eraser center, in world units.
     * @param radius - Eraser radius, in world units.
     * @returns The object if it was removed, null otherwise.
     */
    public abstract checkDelete(eraserPoint: Vector, radius: number): TrackObject | null;

    /** Applies the effect of the object to a bike part during a physics tick, if it touches it. */
    public abstract touch(part: Collidable): void;

    /** Serializes the object in the track code format, marking it as recorded. */
    public abstract toString(): string;

    /** Registers the object in the totals of its layer, called once added to the track. */
    protected abstract onAdd(): void;
    /** Unregisters the object from the totals of its layer, called once removed from the track. */
    protected abstract onDelete(): void;

    /** Resets the reached status when restarting the track. */
    public resetReached(): void {}

    /** Draws the object on the track canvas, outside of the cached line images. */
    public render(_ctx: CanvasRenderingContext2D): void {}
    /** Draws the debug overlay of the object. */
    public renderDebug(_ctx: CanvasRenderingContext2D): void {}
}
