import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Grid } from '../../grid/grid';
import type { Polyline } from '../../parser/track-document';
import type { Track } from '../../track/track';
import type { TrackLayer } from '../../track/track-layer';
import type { CommandBlock } from '../command/command-block';
import { TrackObject } from '../track-object';
import { LineStore, NO_LAYER, ON_TRACK, RECORDED, SCENERY } from './line-store';

/** Constructor of the line classes. */
export interface LineClass {
    new (pos: Vector, endPos: Vector, track: Track): Line;
}

/** State of a line off the track, kept by its object until it is added again. */
export interface DetachedLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    len: number;
    color: number;
    order: number | null;
    recorded: boolean;
    touchedPass: number;
    /** Number of the parsed line, see `LineStore.parsed`, -1 for the others. */
    parsed: number;
    /** Uid given by the edits, null for a parsed line or one never edited. */
    uid: string | null;
    layer: TrackLayer | null;
    command: CommandBlock | null;
}

/**
 * Segment of the track, going from {@link TrackObject.pos} to {@link TrackObject.endPos}.
 *
 * On the track, a line keeps its state in the columns of the lines of the track, at its slot (see
 * `LineStore`); off the track, in its own object, until it is added again. Its positions are
 * given as new vectors each time: the collisions and the rendering read the columns instead.
 *
 * Lines are drawn in the cached images of the render cells rather than on every frame.
 */
export abstract class Line extends TrackObject {
    /**
     * Current collision pass, see {@link Line.touched}: a pass starts for each part and layer
     * (see `Track.touch`), rather than clearing the flag of every line of the cells around it.
     */
    private static pass = 0;

    /** Slot of the line in the store of the track, -1 while off the track. */
    public slot = -1;
    /** State of the line while off the track, null while on it. */
    protected detached: DetachedLine | null;

    /** Starts a collision pass: every line is then unchecked, see {@link Line.touched}. */
    public static newPass(): void {
        Line.pass++;
    }

    /** The current collision pass, see {@link Line.touched}. */
    public static get currentPass(): number {
        return Line.pass;
    }

    public constructor(pos: Vector, endPos: Vector, track: Track) {
        super(track);
        const x = endPos.x - pos.x;
        const y = endPos.y - pos.y;
        this.detached = {
            x1: pos.x,
            y1: pos.y,
            x2: endPos.x,
            y2: endPos.y,
            // As the length of the vector of the line
            len: Math.sqrt(x * x + y * y),
            color: 0,
            order: null,
            recorded: false,
            touchedPass: -1,
            parsed: -1,
            uid: null,
            layer: null,
            command: null,
        };
    }

    /** The store of the lines of the track. */
    public get store(): LineStore {
        return this.track.lineStore;
    }

    public get pos(): Vector {
        const slot = this.slot;
        return slot >= 0
            ? new Vector(this.store.x1[slot], this.store.y1[slot])
            : new Vector(this.detached!.x1, this.detached!.y1);
    }

    public set pos(pos: Vector) {
        if (this.slot >= 0) {
            this.store.x1[this.slot] = pos.x;
            this.store.y1[this.slot] = pos.y;
        } else {
            this.detached!.x1 = pos.x;
            this.detached!.y1 = pos.y;
        }
    }

    public get endPos(): Vector {
        const slot = this.slot;
        return slot >= 0
            ? new Vector(this.store.x2[slot], this.store.y2[slot])
            : new Vector(this.detached!.x2, this.detached!.y2);
    }

    public set endPos(endPos: Vector) {
        if (this.slot >= 0) {
            this.store.x2[this.slot] = endPos.x;
            this.store.y2[this.slot] = endPos.y;
        } else {
            this.detached!.x2 = endPos.x;
            this.detached!.y2 = endPos.y;
        }
    }

    /** Length of the line, in world units. */
    public get len(): number {
        return this.slot >= 0 ? this.store.len[this.slot] : this.detached!.len;
    }

    /**
     * Index of the color of a scenery line in `SCENERY_COLORS`, 0 for the grey of the original
     * scenery; always 0 for a solid line.
     */
    public get color(): number {
        return this.slot >= 0 ? this.store.color[this.slot] : this.detached!.color;
    }

    public set color(color: number) {
        if (this.slot >= 0) {
            this.store.color[this.slot] = color;
        } else {
            this.detached!.color = color;
        }
    }

    public get order(): number | null {
        if (this.slot < 0) {
            return this.detached!.order;
        }
        const order = this.store.order[this.slot];
        return Number.isNaN(order) ? null : order;
    }

    public set order(order: number | null) {
        if (this.slot >= 0) {
            this.store.order[this.slot] = order ?? NaN;
        } else {
            this.detached!.order = order;
        }
    }

    public get recorded(): boolean {
        return this.slot >= 0
            ? (this.store.flags[this.slot] & RECORDED) !== 0
            : this.detached!.recorded;
    }

    public set recorded(recorded: boolean) {
        if (this.slot >= 0) {
            this.setFlag(RECORDED, recorded);
        } else {
            this.detached!.recorded = recorded;
        }
    }

    public get onTrack(): boolean {
        return this.slot >= 0 && (this.store.flags[this.slot] & ON_TRACK) !== 0;
    }

    public set onTrack(onTrack: boolean) {
        // Only while it has a slot, see `addToTrack`
        if (this.slot >= 0) {
            this.setFlag(ON_TRACK, onTrack);
        }
    }

    public get layer(): TrackLayer | null {
        if (this.slot < 0) {
            return this.detached!.layer;
        }
        const index = this.store.layer[this.slot];
        return index === NO_LAYER ? null : this.store.layers[index];
    }

    public set layer(layer: TrackLayer | null) {
        if (this.slot < 0) {
            this.detached!.layer = layer;
        } else {
            this.store.layer[this.slot] = layer ? this.store.layerIndex(layer) : NO_LAYER;
        }
    }

    public get command(): CommandBlock | null {
        return this.slot >= 0
            ? (this.store.commands.get(this.slot) ?? null)
            : this.detached!.command;
    }

    public set command(command: CommandBlock | null) {
        if (this.slot < 0) {
            this.detached!.command = command;
        } else if (command) {
            this.store.commands.set(this.slot, command);
        } else {
            this.store.commands.delete(this.slot);
        }
    }

    public get uid(): string | null {
        if (this.slot < 0) {
            const { uid, parsed } = this.detached!;
            return uid ?? (parsed >= 0 ? `p${parsed}` : null);
        }
        const parsed = this.store.parsed[this.slot];
        return this.store.uids.get(this.slot) ?? (parsed >= 0 ? `p${parsed}` : null);
    }

    public set uid(uid: string | null) {
        if (this.slot < 0) {
            this.detached!.uid = uid;
            this.detached!.parsed = -1;
            return;
        }
        if (uid === null) {
            this.store.uids.delete(this.slot);
        } else {
            this.store.uids.set(this.slot, uid);
        }
        this.store.parsed[this.slot] = -1;
    }

    public setParsedUid(number: number): void {
        if (this.slot < 0) {
            this.detached!.uid = null;
            this.detached!.parsed = number;
            return;
        }
        this.store.uids.delete(this.slot);
        this.store.parsed[this.slot] = number;
    }

    /**
     * Whether the line was checked against the current part, in the current collision pass: a
     * line spanning several cells must only collide once.
     */
    public get touched(): boolean {
        const pass =
            this.slot >= 0 ? this.store.touchedPass[this.slot] : this.detached!.touchedPass;
        return pass === Line.pass;
    }

    public set touched(touched: boolean) {
        const pass = touched ? Line.pass : -1;
        if (this.slot >= 0) {
            this.store.touchedPass[this.slot] = pass;
        } else {
            this.detached!.touchedPass = pass;
        }
    }

    /**
     * Vector from the start to the end of the line, computed when needed rather than kept: a
     * large track holds a million lines, and only the lines near a bike need it, the same
     * subtraction giving the same vector each time.
     */
    public get vector(): Vector {
        return this.endPos.sub(this.pos);
    }

    /** Takes a slot of the store, then adds the line to the grids of its layer. */
    public override addToTrack(): void {
        if (this.onTrack) {
            return;
        }
        this.attach();
        super.addToTrack();
    }

    /** Removes the line from the grids of its layer, then gives its state back to its object. */
    public override removeFromTrack(): void {
        if (!this.onTrack) {
            return;
        }
        super.removeFromTrack();
        this.detach();
    }

    public touch(_part: Collidable): void {}

    public checkDelete(eraserPoint: Vector, radius: number): Line | null {
        if (!this.onTrack) {
            return null;
        }

        // Closest point of the line to the eraser
        const pos = this.pos;
        const endPos = this.endPos;
        const len = this.len;
        const eraserToPosDistance = eraserPoint.sub(pos);
        const normalizedVector = endPos.sub(pos).recipScale(len);
        const normalizedDirection = eraserToPosDistance.dot(normalizedVector);
        const posToCheck = new Vector();

        if (normalizedDirection <= 0) {
            posToCheck.set(pos);
        } else if (normalizedDirection >= len) {
            posToCheck.set(endPos);
        } else {
            posToCheck.set(pos.add(normalizedVector.scale(normalizedDirection)));
        }

        if (eraserPoint.sub(posToCheck).getLength() <= radius) {
            this.removeFromTrack();
            return this;
        }

        return null;
    }

    /**
     * Points of the line followed by the lines connected after it, of the same kind and color,
     * rounded: a polyline is thus exported as a single list of points, every chained line being
     * marked as recorded so that it is not exported again on its own.
     */
    public toPolyline(): Polyline {
        const pos = this.pos;
        const polyline = [Math.round(pos.x), Math.round(pos.y)];
        for (let line: Line | undefined = this; line; line = line.next()) {
            line.recorded = true;
            const endPos = line.endPos;
            polyline.push(Math.round(endPos.x), Math.round(endPos.y));
        }
        return polyline;
    }

    /** The polyline of the line in base 32, see {@link Line.toPolyline}. */
    public toString(): string {
        return this.toPolyline()
            .map((value) => value.toString(32))
            .join(' ');
    }

    /** The line connected after this one not exported yet, of the same kind and color. */
    private next(): Line | undefined {
        const endPos = this.endPos;
        const gridCoords = Grid.gridCoords(endPos, this.grid.cellSize);
        return this.grid
            .cell(gridCoords.x, gridCoords.y)
            .search(endPos, this.kind, this.color);
    }

    private setFlag(flag: number, set: boolean): void {
        if (set) {
            this.store.flags[this.slot] |= flag;
        } else {
            this.store.flags[this.slot] &= ~flag;
        }
    }

    /** Moves the state of the line into a new slot of the store, at the end. */
    private attach(): void {
        const data = this.detached!;
        const store = this.store;
        const slot = store.allocate();
        store.x1[slot] = data.x1;
        store.y1[slot] = data.y1;
        store.x2[slot] = data.x2;
        store.y2[slot] = data.y2;
        store.len[slot] = data.len;
        store.color[slot] = data.color;
        store.order[slot] = data.order ?? NaN;
        store.touchedPass[slot] = data.touchedPass;
        store.parsed[slot] = data.parsed;
        store.flags[slot] =
            (this.kind === 'scenery' ? SCENERY : 0) | (data.recorded ? RECORDED : 0);
        store.layer[slot] = data.layer ? store.layerIndex(data.layer) : NO_LAYER;
        if (data.uid !== null) {
            store.uids.set(slot, data.uid);
        }
        if (data.command) {
            store.commands.set(slot, data.command);
        }
        this.slot = slot;
        this.detached = null;
    }

    /** Gives the state of the line back to its object, leaving its slot empty. */
    private detach(): void {
        const store = this.store;
        const slot = this.slot;
        this.detached = {
            x1: store.x1[slot],
            y1: store.y1[slot],
            x2: store.x2[slot],
            y2: store.y2[slot],
            len: store.len[slot],
            color: store.color[slot],
            order: Number.isNaN(store.order[slot]) ? null : store.order[slot],
            recorded: (store.flags[slot] & RECORDED) !== 0,
            touchedPass: store.touchedPass[slot],
            parsed: store.parsed[slot],
            uid: store.uids.get(slot) ?? null,
            layer: store.layer[slot] === NO_LAYER ? null : store.layers[store.layer[slot]],
            command: store.commands.get(slot) ?? null,
        };
        store.uids.delete(slot);
        store.commands.delete(slot);
        this.slot = -1;
    }
}
