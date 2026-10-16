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

    /** Stores the object in the list matching its kind. */
    public push(obj: TrackObject): void {
        switch (obj.kind) {
            case 'scenery':
                this.scenery.push(obj as SceneryLine);
                break;
            case 'solid':
                this.lines.push(obj as SolidLine);
                break;
            case 'item':
                this.objects.push(obj as Item);
                break;
        }

        this.clear();
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
