import type { Cell } from '../../grid/cell/cell';
import type { Track } from '../../track/track';
import type { TrackLayer } from '../../track/track-layer';
import type { CommandBlock } from '../command/command-block';
import type { Line } from './line';

/** Capacity of a new store, in lines, doubled each time it fills up. */
const INITIAL_CAPACITY = 1024;
/**
 * Empty slots past which the store is compacted (see {@link LineStore.compactIfNeeded}): at
 * least this many, and half the slots.
 */
const COMPACT_MIN_HOLES = 4096;

/** Creates the object of a line of a kind, bound to a slot, see `LineStore.handle`. */
export type LineHandleFactory = (track: Track, slot: number) => Line;

/** Bits of {@link LineStore.flags}. */
export const ON_TRACK = 1,
    RECORDED = 2,
    /** Set for a scenery line, clear for a solid line. */
    SCENERY = 4,
    /** {@link LineStore.layer} of a line without layer. */
    NO_LAYER = 0xffff;

/**
 * The lines on a track, stored as columns of typed arrays rather than as objects: a large track
 * holds a million lines, which as objects took hundreds of bytes each, and the collisions, the
 * rendering and the exports read them in a row.
 *
 * Each line on the track has a slot, given when it is added and never reused: the slots are in
 * the order the lines were added, the order of the exports. A line taken off the track keeps its
 * data in its `Line` object until it is added again, to a new slot.
 *
 * The positions are kept as doubles, exactly as computed: the recorded ghosts depend on every bit
 * of the collisions.
 */
export class LineStore {
    public x1 = new Float64Array(INITIAL_CAPACITY);
    public y1 = new Float64Array(INITIAL_CAPACITY);
    public x2 = new Float64Array(INITIAL_CAPACITY);
    public y2 = new Float64Array(INITIAL_CAPACITY);
    /** Length of each line, in world units. */
    public len = new Float64Array(INITIAL_CAPACITY);
    /** Rank of each line in the grid cells (see `TrackObject.order`), NaN without one. */
    public order = new Float64Array(INITIAL_CAPACITY);
    /** Collision pass each line was last checked in, see `Line.touched`. */
    public touchedPass = new Int32Array(INITIAL_CAPACITY);
    /** Number of each parsed line, its uid being `p<number>`; -1 for the others. */
    public parsed = new Int32Array(INITIAL_CAPACITY);
    /** Index of the color of each line, see `Line.color`. */
    public color = new Uint8Array(INITIAL_CAPACITY);
    /** {@link ON_TRACK}, {@link RECORDED} and {@link SCENERY} of each line. */
    public flags = new Uint8Array(INITIAL_CAPACITY);
    /** Layer of each line, by its index in {@link LineStore.layers}. */
    public layer = new Uint16Array(INITIAL_CAPACITY);

    /** Layers of the lines, see {@link LineStore.layer}. */
    public readonly layers: TrackLayer[] = [];
    private readonly layerIndexes = new Map<TrackLayer, number>();
    /** Uids given by the edits, by slot: the others are parsed, or have none. */
    public readonly uids = new Map<number, string>();
    /** Command blocks of the lines bound to one, by slot. */
    public readonly commands = new Map<number, CommandBlock>();

    /** Number of slots given so far, the lines taken off the track leaving theirs empty. */
    public size = 0;
    /** Number of slots left empty by the lines taken off the track. */
    public holes = 0;

    /** Object of the solid and of the scenery lines, set by their classes (see `handle`). */
    public static readonly factories: Partial<Record<'solid' | 'scenery', LineHandleFactory>> = {};

    /**
     * Objects of the lines by slot, kept while something keeps them: the cells keep the slots,
     * and the lines are made objects only for the code handling objects, e.g. the editor. A line
     * then stays the same object while it is kept.
     */
    private readonly handles = new Map<number, WeakRef<Line>>();
    private readonly released = new FinalizationRegistry<number>((slot) => {
        if (this.handles.get(slot)?.deref() === undefined) {
            this.handles.delete(slot);
        }
    });
    /** Slot of each parsed line on the track by its number, -1 for none. */
    private parsedSlots = new Int32Array(0);
    /** Slot of each line on the track with a uid given by the edits. */
    private readonly uidSlots = new Map<string, number>();
    /** Cells holding slots, moved when the store is compacted. */
    private readonly cells = new Set<WeakRef<Cell>>();

    public constructor(private readonly track: Track) {}

    /** Gives a new slot, at the end, growing the columns when full. */
    public allocate(): number {
        if (this.size === this.x1.length) {
            this.grow(this.size * 2);
        }
        return this.size++;
    }

    /**
     * Object of the line of a slot: the one kept, or a new one bound to the slot. A slot left by
     * a line taken off the track, still listed by a cell until the end of a batch, gives the
     * object of the line, off the track.
     */
    public handle(slot: number): Line {
        const kept = this.handles.get(slot)?.deref();
        if (kept) {
            return kept;
        }
        const factory = LineStore.factories[this.flags[slot] & SCENERY ? 'scenery' : 'solid'];
        if (!factory) {
            throw new Error('The line classes are not loaded');
        }
        const line = factory(this.track, slot);
        this.keep(slot, line);
        return line;
    }

    /** Keeps the object of the line of a slot, see {@link LineStore.handle}. */
    public keep(slot: number, line: Line): void {
        this.handles.set(slot, new WeakRef(line));
        this.released.register(line, slot);
    }

    /** Follows the uid of the line of a slot, to find it with {@link LineStore.lineByUid}. */
    public indexUid(slot: number, set: boolean): void {
        const parsed = this.parsed[slot];
        if (parsed >= 0) {
            if (set) {
                if (parsed >= this.parsedSlots.length) {
                    const grown = new Int32Array(Math.max(parsed + 1, this.parsedSlots.length * 2));
                    grown.fill(-1);
                    grown.set(this.parsedSlots);
                    this.parsedSlots = grown;
                }
                this.parsedSlots[parsed] = slot;
            } else if (this.parsedSlots[parsed] === slot) {
                this.parsedSlots[parsed] = -1;
            }
        }
        const uid = this.uids.get(slot);
        if (uid !== undefined) {
            if (set) {
                this.uidSlots.set(uid, slot);
            } else if (this.uidSlots.get(uid) === slot) {
                this.uidSlots.delete(uid);
            }
        }
    }

    /** The line on the track with a uid, see `TrackObject.uid`. */
    public lineByUid(uid: string): Line | undefined {
        const slot = this.slotOfUid(uid);
        return slot >= 0 && this.flags[slot] & ON_TRACK ? this.handle(slot) : undefined;
    }

    /** Slot indexed for a uid (see {@link LineStore.indexUid}), -1 for none. */
    public slotOfUid(uid: string): number {
        const slot = this.uidSlots.get(uid);
        if (slot !== undefined) {
            return slot;
        }
        return /^p\d+$/.test(uid) ? (this.parsedSlots[Number(uid.slice(1))] ?? -1) : -1;
    }

    /**
     * Slots of the lines on the track of a layer and a kind, in the order they were added, as
     * the exports write them.
     */
    public *slotsOf(layer: TrackLayer, scenery: boolean): Generator<number> {
        const index = this.layerIndexes.get(layer);
        if (index === undefined) {
            return;
        }
        const kind = scenery ? SCENERY : 0;
        for (let slot = 0; slot < this.size; slot++) {
            const flags = this.flags[slot];
            if (flags & ON_TRACK && (flags & SCENERY) === kind && this.layer[slot] === index) {
                yield slot;
            }
        }
    }

    /** Follows a cell holding slots, to move them when the store is compacted. */
    public follow(cell: Cell): void {
        this.cells.add(new WeakRef(cell));
    }

    /** Leaves the slot of a line taken off the track empty. */
    public release(): void {
        this.holes++;
    }

    /**
     * Compacts the store once it holds many empty slots, e.g. after a long ride of the endurance
     * mode adding and removing its sections: the lines on the track move to the first slots, in
     * their order, and the cells and the objects of the lines follow. Not during a batch, whose
     * cells still list the slots of the lines removed (see `Cell.batch`), nor while the cells are
     * read: called between two frames.
     *
     * @returns Whether it was compacted.
     */
    public compactIfNeeded(): boolean {
        if (this.holes < COMPACT_MIN_HOLES || this.holes * 2 < this.size) {
            return false;
        }
        this.compact();
        return true;
    }

    /** Moves the lines on the track to the first slots, see {@link LineStore.compactIfNeeded}. */
    public compact(): void {
        const moved = new Int32Array(this.size).fill(-1);
        let next = 0;
        for (let slot = 0; slot < this.size; slot++) {
            if (!(this.flags[slot] & ON_TRACK)) {
                continue;
            }
            moved[slot] = next;
            if (next !== slot) {
                this.x1[next] = this.x1[slot];
                this.y1[next] = this.y1[slot];
                this.x2[next] = this.x2[slot];
                this.y2[next] = this.y2[slot];
                this.len[next] = this.len[slot];
                this.order[next] = this.order[slot];
                this.touchedPass[next] = this.touchedPass[slot];
                this.parsed[next] = this.parsed[slot];
                this.color[next] = this.color[slot];
                this.flags[next] = this.flags[slot];
                this.layer[next] = this.layer[slot];
            }
            next++;
        }
        this.flags.fill(0, next, this.size);
        this.size = next;
        this.holes = 0;

        const remap = <T>(map: Map<number, T>) => {
            const entries = [...map].filter(([slot]) => moved[slot] >= 0);
            map.clear();
            entries.forEach(([slot, value]) => map.set(moved[slot], value));
        };
        remap(this.uids);
        remap(this.commands);
        const handles = [...this.handles];
        this.handles.clear();
        for (const [slot, ref] of handles) {
            const line = ref.deref();
            if (line && line.slot === slot && moved[slot] >= 0) {
                line.slot = moved[slot];
                this.keep(moved[slot], line);
            }
        }
        this.parsedSlots.fill(-1);
        this.uidSlots.clear();
        for (let slot = 0; slot < this.size; slot++) {
            this.indexUid(slot, true);
        }
        for (const ref of [...this.cells]) {
            const cell = ref.deref();
            if (cell) {
                cell.remapSlots(moved);
            } else {
                this.cells.delete(ref);
            }
        }
    }

    /**
     * Adds a line on the track from its data, without an object, e.g. parsed: its slot, to store
     * in the grids (see `Track.addLineSlot`). Its length is computed as `Line` does.
     *
     * @param parsed - Number of the parsed line, its uid being `p<number>`.
     */
    public addLine(
        layer: TrackLayer,
        scenery: boolean,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color: number,
        parsed: number,
    ): number {
        const slot = this.allocate();
        const x = x2 - x1;
        const y = y2 - y1;
        this.x1[slot] = x1;
        this.y1[slot] = y1;
        this.x2[slot] = x2;
        this.y2[slot] = y2;
        this.len[slot] = Math.sqrt(x * x + y * y);
        this.order[slot] = NaN;
        this.touchedPass[slot] = -1;
        this.parsed[slot] = parsed;
        this.color[slot] = color;
        this.flags[slot] = ON_TRACK | (scenery ? SCENERY : 0);
        this.layer[slot] = this.layerIndex(layer);
        this.indexUid(slot, true);
        return slot;
    }

    /** Index of a layer in {@link LineStore.layers}, added if missing. */
    public layerIndex(layer: TrackLayer): number {
        let index = this.layerIndexes.get(layer);
        if (index === undefined) {
            index = this.layers.push(layer) - 1;
            this.layerIndexes.set(layer, index);
        }
        return index;
    }

    /** Copies the columns into larger ones. */
    private grow(capacity: number): void {
        const grown = <T extends Float64Array | Int32Array | Uint8Array | Uint16Array>(
            column: T,
        ): T => {
            const larger = new (column.constructor as new (length: number) => T)(capacity);
            larger.set(column);
            return larger;
        };
        this.x1 = grown(this.x1);
        this.y1 = grown(this.y1);
        this.x2 = grown(this.x2);
        this.y2 = grown(this.y2);
        this.len = grown(this.len);
        this.order = grown(this.order);
        this.touchedPass = grown(this.touchedPass);
        this.parsed = grown(this.parsed);
        this.color = grown(this.color);
        this.flags = grown(this.flags);
        this.layer = grown(this.layer);
    }
}
