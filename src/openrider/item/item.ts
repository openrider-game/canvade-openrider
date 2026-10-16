import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import { TrackObject } from './track-object';

/** Static side of the item classes, used to read items from the track code. */
export interface ItemClass {
    /** Name displayed to the player. */
    readonly itemName: string;
    /** Fill color of the item. */
    readonly color: string;
    /** Letter identifying the item in the track code. */
    readonly code: string;
    /**
     * Creates an item from its code.
     *
     * @param itemCode - Item code split on spaces, starting with the item letter.
     */
    createInstance(itemCode: string[], track: Track): Item;
}

/**
 * Reads the position of an item from its code.
 *
 * @param itemCode - Item code split on spaces: `code x y ...`, with base 32 coordinates.
 */
export function parseItemPosition(itemCode: string[]): Vector {
    return new Vector(parseInt(itemCode[1], 32), parseInt(itemCode[2], 32));
}

/**
 * Object of the track touched by the bikes, drawn as a circle by default.
 *
 * Items are rendered on every frame from the cell objects, not in the cached line images.
 */
export abstract class Item extends TrackObject {
    public static readonly itemName: string = 'Item';
    public static readonly color: string = '#fff';
    public static readonly code: string = '';

    public readonly kind = 'item';

    /** Static side of the item, giving its code and color. */
    public get itemClass(): ItemClass {
        return this.constructor as unknown as ItemClass;
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const zoom = this.track.zoomFactor;

        ctx.save();
        ctx.fillStyle = this.itemClass.color;
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.moveTo(pos.x + 7 * zoom, pos.y);
        ctx.arc(pos.x, pos.y, 7 * zoom, 0, 2 * Math.PI, true);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    public override renderDebug(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const id = this.id.toString();

        ctx.save();
        ctx.font = `bold ${Math.min(15 * this.track.zoomFactor, 15)}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(id, pos.x - ctx.measureText(id).width / 2, pos.y - 15 * this.track.zoomFactor);

        ctx.restore();
    }

    /** Triggers {@link Item.onTouch} when the part is close enough to the item center. */
    public touch(part: Collidable): void {
        if (part.pos.distanceToSquared(this.pos) < 500) {
            this.onTouch(part);
        }
    }

    public checkDelete(eraserPoint: Vector, radius: number): Item | null {
        if (this.onTrack && eraserPoint.distanceTo(this.pos) < radius + 7) {
            this.removeFromTrack();
            return this;
        }

        return null;
    }

    public toString(): string {
        this.recorded = true;
        return this.itemClass.code + ' ' + this.pos.toString();
    }

    /** Applies the item effect, called when a bike part touches the item. */
    protected onTouch(_part: Collidable): void {}

    protected onAdd(): void {
        this.grid.totalObjects.set(this.id, this);
    }

    protected onDelete(): void {
        this.grid.totalObjects.delete(this.id);
    }

    public static createInstance(itemCode: string[], track: Track): Item {
        const ItemConstructor = this as unknown as new (pos: Vector, track: Track) => Item;
        return new ItemConstructor(parseItemPosition(itemCode), track);
    }
}
