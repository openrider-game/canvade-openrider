import type { TrackLayer } from '../../track/track-layer';
import type { CommandBlock } from '../command/command-block';

/** Capacity of a new store, in lines, doubled each time it fills up. */
const INITIAL_CAPACITY = 1024;

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

    /** Gives a new slot, at the end, growing the columns when full. */
    public allocate(): number {
        if (this.size === this.x1.length) {
            this.grow(this.size * 2);
        }
        return this.size++;
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
