import type { Item } from '../../item/item';
import type { SceneryLine } from '../../item/line/scenery-line';
import type { SolidLine } from '../../item/line/solid-line';
import type { TrackObject } from '../../item/track-object';

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
        switch (obj.kind) {
            case 'scenery':
                Cell.insert(this.scenery, obj as SceneryLine);
                break;
            case 'solid':
                Cell.insert(this.lines, obj as SolidLine);
                break;
            case 'item':
                Cell.insert(this.objects, obj as Item);
                break;
        }

        this.clear();
    }

    private static insert<T extends TrackObject>(list: T[], obj: T): void {
        const order = obj.order;
        let index = list.length;
        // Usually at the end: the objects are mostly added in order
        if (order !== null) {
            while (index > 0 && (list[index - 1].order ?? -Infinity) > order) {
                index--;
            }
        }
        list.splice(index, 0, obj);
    }

    public remove(obj: TrackObject): void {
        if (Cell.batching > 0) {
            (this.removed ??= new Set()).add(obj);
            Cell.pending.add(this);
        } else {
            switch (obj.kind) {
                case 'scenery':
                    this.scenery = this.scenery.filter((line) => line !== obj);
                    break;
                case 'solid':
                    this.lines = this.lines.filter((line) => line !== obj);
                    break;
                case 'item':
                    this.objects = this.objects.filter((item) => item !== obj);
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
        // What was derived from the lists during the batch is outdated
        this.clear();
    }

    /** Called when the content of the cell changes. */
    protected clear(): void {}
}
