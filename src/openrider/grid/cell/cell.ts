import type { Item } from '../../item/item';
import type { SceneryLine } from '../../item/line/scenery-line';
import type { SolidLine } from '../../item/line/solid-line';
import type { TrackObject } from '../../item/track-object';

/** Bit of each kind of object in `Cell.unsorted`. */
const KIND_BITS: Record<TrackObject['kind'], number> = { scenery: 1, solid: 2, item: 4 };

/**
 * Square area of a grid, listing the track objects crossing it by kind.
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

    public scenery: SceneryLine[] = [];
    public lines: SolidLine[] = [];
    public objects: Item[] = [];
    /** Objects removed during a batch, still in the lists until it ends. */
    private removed: Set<TrackObject> | null = null;
    /**
     * Lists not sorted by rank, by the bits of their kinds (see {@link KIND_BITS}): an object
     * without rank added after ranked ones. A sorted list finds the place of a ranked object by
     * a binary search rather than by walking back from its end, e.g. undoing an erase after the
     * objects of a live session were ranked.
     */
    private unsorted = 0;

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
     * them when it has one (see {@link TrackObject.order}).
     */
    public push(obj: TrackObject): void {
        // After the objects removed, as without a batch
        this.flushRemoved();
        const bit = KIND_BITS[obj.kind];
        const sorted = (this.unsorted & bit) === 0;
        let stillSorted: boolean;
        switch (obj.kind) {
            case 'scenery':
                stillSorted = Cell.insert(this.scenery, obj as SceneryLine, sorted);
                break;
            case 'solid':
                stillSorted = Cell.insert(this.lines, obj as SolidLine, sorted);
                break;
            case 'item':
                stillSorted = Cell.insert(this.objects, obj as Item, sorted);
                break;
        }
        this.unsorted = stillSorted ? this.unsorted & ~bit : this.unsorted | bit;

        this.clear();
    }

    /**
     * Inserts an object: at the end without a rank, else after the last object from the end
     * whose rank is not greater, the objects without rank counting as the lowest.
     *
     * @param sorted - Whether the list is sorted by rank: the place is then found by a binary
     * search, the same place as walking back from the end.
     * @returns Whether the list is sorted by rank after it.
     */
    private static insert<T extends TrackObject>(list: T[], obj: T, sorted: boolean): boolean {
        const order = obj.order;
        if (order === null) {
            const last = list[list.length - 1];
            list.push(obj);
            return sorted && (last === undefined || last.order === null);
        }
        let index = list.length;
        if (sorted) {
            // First object of greater rank
            let low = 0;
            while (low < index) {
                const middle = (low + index) >>> 1;
                if ((list[middle].order ?? -Infinity) > order) {
                    index = middle;
                } else {
                    low = middle + 1;
                }
            }
        } else {
            // Usually at the end: the objects are mostly added in order
            while (index > 0 && (list[index - 1].order ?? -Infinity) > order) {
                index--;
            }
        }
        if (index === list.length) {
            list.push(obj);
        } else {
            list.splice(index, 0, obj);
        }
        return sorted;
    }

    /** Whether a list is sorted by rank, the objects without rank counting as the lowest. */
    private static isSorted(list: readonly TrackObject[]): boolean {
        for (let i = 1; i < list.length; i++) {
            if ((list[i - 1].order ?? -Infinity) > (list[i].order ?? -Infinity)) {
                return false;
            }
        }
        return true;
    }

    /** Tells whether the list of a kind is sorted again, once objects were taken off it. */
    private resort(kind: TrackObject['kind'], list: readonly TrackObject[]): void {
        const bit = KIND_BITS[kind];
        if (this.unsorted & bit && Cell.isSorted(list)) {
            this.unsorted &= ~bit;
        }
    }

    public remove(obj: TrackObject): void {
        if (Cell.batching > 0) {
            (this.removed ??= new Set()).add(obj);
            Cell.pending.add(this);
        } else {
            switch (obj.kind) {
                case 'scenery':
                    this.scenery = this.scenery.filter((line) => line !== obj);
                    this.resort('scenery', this.scenery);
                    break;
                case 'solid':
                    this.lines = this.lines.filter((line) => line !== obj);
                    this.resort('solid', this.lines);
                    break;
                case 'item':
                    this.objects = this.objects.filter((item) => item !== obj);
                    this.resort('item', this.objects);
                    break;
            }
        }

        this.clear();
    }

    /** Takes the objects removed during a batch off the lists, keeping their order. */
    private flushRemoved(): void {
        const removed = this.removed;
        if (!removed) {
            return;
        }
        this.removed = null;
        Cell.pending.delete(this);
        this.scenery = this.scenery.filter((line) => !removed.has(line));
        this.lines = this.lines.filter((line) => !removed.has(line));
        this.objects = this.objects.filter((item) => !removed.has(item));
        this.resort('scenery', this.scenery);
        this.resort('solid', this.lines);
        this.resort('item', this.objects);
        // What was derived from the lists during the batch is outdated
        this.clear();
    }

    /** Called when the content of the cell changes. */
    protected clear(): void {}
}
