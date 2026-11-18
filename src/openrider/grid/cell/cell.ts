import type { Item } from '../../item/item';
import type { Line } from '../../item/line/line';
import type { LineStore } from '../../item/line/line-store';
import type { SceneryLine } from '../../item/line/scenery-line';
import type { SolidLine } from '../../item/line/solid-line';
import type { TrackObject } from '../../item/track-object';

/** Bit of each kind of object in `Cell.unsorted`. */
const KIND_BITS: Record<TrackObject['kind'], number> = { scenery: 1, solid: 2, item: 4 };

/**
 * Square area of a grid, listing the track objects crossing it by kind: the lines by their slot
 * in the store of the lines of the track (see `LineStore`), the items as objects.
 *
 * An object crossing several cells is stored in each of them. The lists keep the order the objects
 * were added in, which the collisions depend on.
 *
 * Removing an object rebuilds the list it is in: removing many objects from crowded cells, e.g.
 * erasing a large area, removes them in a {@link Cell.batch}, each cell rebuilding its lists once.
 */
export abstract class Cell {
    /** Nesting of the batches, see {@link Cell.batch}. */
    private static batching = 0;
    /** Cells with removals waiting for the end of the batch. */
    private static readonly pending = new Set<Cell>();

    /** Slots of the scenery lines, see `LineStore`. */
    public scenerySlots: number[] = [];
    /** Slots of the solid lines, see `LineStore`. */
    public lineSlots: number[] = [];
    public objects: Item[] = [];
    /** Store of the lines of the track, known from the first line added. */
    public store: LineStore | null = null;
    /** Items removed during a batch, still in the lists until it ends. */
    private removedItems: Set<Item> | null = null;
    /** Slots of the lines removed during a batch, still in the lists until it ends. */
    private removedSlots: Set<number> | null = null;
    /**
     * Lists not sorted by rank, by the bits of their kinds (see {@link KIND_BITS}): an object
     * without rank added after ranked ones. A sorted list finds the place of a ranked object by
     * a binary search rather than by walking back from its end, e.g. undoing an erase after the
     * objects of a live session were ranked.
     */
    private unsorted = 0;

    /** Whether removals wait for the end of a batch, see {@link Cell.batch}. */
    public static get batchingNow(): boolean {
        return Cell.batching > 0;
    }

    /**
     * Runs an action removing many objects, e.g. erasing an area or undoing an edit: the objects
     * are taken off the lists of each cell at once when it ends, so that removing k objects from
     * a cell of n costs n rather than k times n.
     *
     * Until it ends, the objects removed are still listed by their cells, but off the track (see
     * `TrackObject.onTrack`). A cell receiving an object meanwhile takes them off first.
     */
    public static batch<T>(action: () => T): T {
        Cell.batching++;
        try {
            return action();
        } finally {
            Cell.batching--;
            if (Cell.batching === 0) {
                Cell.pending.forEach((cell) => cell.flushRemoved());
                Cell.pending.clear();
            }
        }
    }

    /**
     * Creates an empty cell.
     *
     * @param x - Left of the cell, in world units.
     * @param y - Top of the cell, in world units.
     * @param size - Size of the cell, in world units.
     */
    public constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly size: number,
    ) {}

    /** The solid lines, as objects (see `LineStore.handle`): the slots are read otherwise. */
    public get lines(): SolidLine[] {
        return this.handles(this.lineSlots) as SolidLine[];
    }

    /** The scenery lines, as objects (see `LineStore.handle`). */
    public get scenery(): SceneryLine[] {
        return this.handles(this.scenerySlots) as SceneryLine[];
    }

    /** Whether a position is in the cell, e.g. the position of an object. */
    public contains(pos: { x: number; y: number }): boolean {
        return (
            pos.x >= this.x &&
            pos.x < this.x + this.size &&
            pos.y >= this.y &&
            pos.y < this.y + this.size
        );
    }

    /**
     * Stores the object in the list matching its kind: after the others, or at its rank among
     * them when it has one (see {@link TrackObject.order}). A line must be on the track: its slot
     * is stored.
     */
    public push(obj: TrackObject): void {
        // After the objects removed, as without a batch
        this.flushRemoved();
        const bit = KIND_BITS[obj.kind];
        const sorted = (this.unsorted & bit) === 0;
        let stillSorted: boolean;
        if (obj.kind === 'item') {
            stillSorted = Cell.insert(this.objects, obj as Item, Cell.itemRank, sorted);
            this.unsorted = stillSorted ? this.unsorted & ~bit : this.unsorted | bit;
            this.clear();
        } else {
            const line = obj as Line;
            this.insertSlot(line.store, line.slot, obj.kind === 'scenery');
        }
    }

    /**
     * Stores the line of a slot, as {@link Cell.push} stores a line, without its object, e.g. a
     * line parsed.
     */
    public pushSlot(store: LineStore, slot: number, scenery: boolean): void {
        this.flushRemoved();
        this.insertSlot(store, slot, scenery);
    }

    private insertSlot(store: LineStore, slot: number, scenery: boolean): void {
        if (!this.store) {
            this.store = store;
            store.follow(this);
        }
        const bit = KIND_BITS[scenery ? 'scenery' : 'solid'];
        const list = scenery ? this.scenerySlots : this.lineSlots;
        const stillSorted = Cell.insert(
            list,
            slot,
            (entry) => Cell.slotRank(store, entry),
            (this.unsorted & bit) === 0,
        );
        this.unsorted = stillSorted ? this.unsorted & ~bit : this.unsorted | bit;
        this.clear();
    }

    /** Rank of an item, the items without rank counting as the lowest. */
    private static itemRank(item: Item): number {
        return item.order ?? -Infinity;
    }

    /** Rank of a line by its slot, the lines without rank counting as the lowest. */
    private static slotRank(store: LineStore, slot: number): number {
        const order = store.order[slot];
        return Number.isNaN(order) ? -Infinity : order;
    }

    /**
     * Inserts an entry: at the end without a rank, else after the last entry from the end whose
     * rank is not greater, the entries without rank counting as the lowest.
     *
     * @param sorted - Whether the list is sorted by rank: the place is then found by a binary
     * search, the same place as walking back from the end.
     * @returns Whether the list is sorted by rank after it.
     */
    private static insert<T>(
        list: T[],
        entry: T,
        rank: (entry: T) => number,
        sorted: boolean,
    ): boolean {
        const order = rank(entry);
        if (order === -Infinity) {
            const last = list[list.length - 1];
            list.push(entry);
            return sorted && (last === undefined || rank(last) === -Infinity);
        }
        let index = list.length;
        if (sorted) {
            // First entry of greater rank
            let low = 0;
            while (low < index) {
                const middle = (low + index) >>> 1;
                if (rank(list[middle]) > order) {
                    index = middle;
                } else {
                    low = middle + 1;
                }
            }
        } else {
            // Usually at the end: the objects are mostly added in order
            while (index > 0 && rank(list[index - 1]) > order) {
                index--;
            }
        }
        if (index === list.length) {
            list.push(entry);
        } else {
            list.splice(index, 0, entry);
        }
        return sorted;
    }

    /** Whether a list is sorted by rank. */
    private static isSorted<T>(list: readonly T[], rank: (entry: T) => number): boolean {
        for (let i = 1; i < list.length; i++) {
            if (rank(list[i - 1]) > rank(list[i])) {
                return false;
            }
        }
        return true;
    }

    /** Tells whether the list of a kind is sorted again, once objects were taken off it. */
    private resort(kind: TrackObject['kind']): void {
        const bit = KIND_BITS[kind];
        if (!(this.unsorted & bit)) {
            return;
        }
        const store = this.store;
        const sorted =
            kind === 'item'
                ? Cell.isSorted(this.objects, Cell.itemRank)
                : Cell.isSorted(kind === 'solid' ? this.lineSlots : this.scenerySlots, (slot) =>
                      Cell.slotRank(store!, slot),
                  );
        if (sorted) {
            this.unsorted &= ~bit;
        }
    }

    /**
     * Takes an object off its list. A line is found by its slot: it must still have it, as
     * `Track.remove` is called before the line leaves the store.
     */
    public remove(obj: TrackObject): void {
        const slot = obj.kind === 'item' ? -1 : (obj as Line).slot;
        if (Cell.batching > 0) {
            if (obj.kind === 'item') {
                (this.removedItems ??= new Set()).add(obj as Item);
            } else {
                (this.removedSlots ??= new Set()).add(slot);
            }
            Cell.pending.add(this);
        } else {
            switch (obj.kind) {
                case 'scenery':
                    this.scenerySlots = this.scenerySlots.filter((entry) => entry !== slot);
                    break;
                case 'solid':
                    this.lineSlots = this.lineSlots.filter((entry) => entry !== slot);
                    break;
                case 'item':
                    this.objects = this.objects.filter((item) => item !== obj);
                    break;
            }
            this.resort(obj.kind);
        }

        this.clear();
    }

    /**
     * Moves the slots of the lines after the store was compacted, see `LineStore.compact`.
     *
     * @param moved - New slot of each old one, -1 for an empty slot.
     */
    public remapSlots(moved: Int32Array): void {
        this.flushRemoved();
        // The same lines in the same order: what was derived from them stays valid
        this.lineSlots = this.lineSlots.map((slot) => moved[slot]);
        this.scenerySlots = this.scenerySlots.map((slot) => moved[slot]);
    }

    /** Takes the objects removed during a batch off the lists, keeping their order. */
    private flushRemoved(): void {
        const removedItems = this.removedItems;
        const removedSlots = this.removedSlots;
        if (!removedItems && !removedSlots) {
            return;
        }
        this.removedItems = null;
        this.removedSlots = null;
        Cell.pending.delete(this);
        if (removedSlots) {
            this.scenerySlots = this.scenerySlots.filter((slot) => !removedSlots.has(slot));
            this.lineSlots = this.lineSlots.filter((slot) => !removedSlots.has(slot));
            this.resort('scenery');
            this.resort('solid');
        }
        if (removedItems) {
            this.objects = this.objects.filter((item) => !removedItems.has(item));
            this.resort('item');
        }
        // What was derived from the lists during the batch is outdated
        this.clear();
    }

    /** Objects of the lines of slots, see `LineStore.handle`. */
    private handles(slots: readonly number[]): Line[] {
        const store = this.store;
        return store ? slots.map((slot) => store.handle(slot)) : [];
    }

    /** Called when the content of the cell changes. */
    protected clear(): void {}
}
