import type { Item } from '../../item/item';
import type { SceneryLine } from '../../item/line/scenery-line';
import type { SolidLine } from '../../item/line/solid-line';
import type { TrackObject } from '../../item/track-object';

/**
 * Square area of a grid, listing the track objects crossing it by kind.
 *
 * An object crossing several cells is stored in each of them.
 */
export abstract class Cell {
    public scenery: SceneryLine[] = [];
    public lines: SolidLine[] = [];
    public objects: Item[] = [];

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

    /**
     * Stores the object in the list matching its kind: after the others, or at its rank among
     * them when it has one (see {@link TrackObject.order}).
     */
    public push(obj: TrackObject): void {
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

        this.clear();
    }

    /** Called when the content of the cell changes. */
    protected clear(): void {}
}
