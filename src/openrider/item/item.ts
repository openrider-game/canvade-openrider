import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import { formatItem, type ItemEntity } from '../parser/track-document';
import { painter } from '../render/painter';
import { type ItemShape, spriteCode } from './item-sprite';
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
     * Creates an item from its values, see `ItemEntity`.
     *
     * @param values - `[x, y, ...]`, followed by the values of the item class.
     */
    createInstance(values: number[], track: Track): Item;
}

/** Position of an item, the first two of its values. */
export function itemPosition(values: number[]): Vector {
    return new Vector(values[0], values[1]);
}

/**
 * Object of the track touched by the bikes, drawn as a circle by default.
 *
 * Items are drawn as sprites in the cached images of the render cells, with the lines (see
 * {@link Item.sprite}); the others, and the items looking different for a while, e.g. once
 * reached, are drawn on every frame instead (see {@link Item.drawnLive}).
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

    /**
     * Shape the item is drawn as in the cached images, filled with its color as
     * {@link Item.render} draws it; null for an item drawn on every frame.
     */
    public get sprite(): ItemShape | null {
        return 'circle';
    }

    /** Fill color of the sprite for now, see `ReachableItem`. */
    public get spriteColor(): string {
        return this.itemClass.color;
    }

    /** Rotation of the sprite, in radians. */
    public get spriteRotation(): number {
        return 0;
    }

    /**
     * Whether the item is drawn on every frame with {@link Item.render}: without a sprite, or
     * looking different from it for now, over it.
     */
    public get drawnLive(): boolean {
        return this.sprite === null;
    }

    /** Draws the item as its sprite looks for now, by the painter drawing the cells too. */
    public override render(ctx: CanvasRenderingContext2D): void {
        const shape = this.sprite;
        if (shape === null) {
            return;
        }
        const pos = this.track.toPixel(this.pos);
        painter.drawItem(
            ctx,
            spriteCode(shape),
            this.spriteColor,
            pos.x,
            pos.y,
            this.spriteRotation,
            this.track.zoomFactor,
        );
    }

    public override renderDebug(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const id = this.id.toString();

        ctx.save();
        ctx.font = `bold ${Math.min(15 * this.track.zoomFactor, 15 * this.track.pixelRatio)}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(id, pos.x - ctx.measureText(id).width / 2, pos.y - 15 * this.track.zoomFactor);

        ctx.restore();
    }

    /**
     * Triggers {@link Item.onTouch} when the part is close enough to the item center, where its
     * command block puts it for the runner of the part: nowhere while hidden, or moved.
     */
    public touch(part: Collidable): void {
        const command = this.command;
        if (command === null) {
            if (part.pos.distanceToSquared(this.pos) < 500) {
                this.onTouch(part);
            }
            return;
        }

        const offset = command.offsetFor(part.bike.runner);
        if (offset !== null && part.pos.distanceToSquared(this.pos.add(offset)) < 500) {
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

    /**
     * The item as stored, its letter then its values (see `ItemEntity`), marking it as exported
     * (see {@link TrackObject.recorded}).
     */
    public toEntity(): ItemEntity {
        this.recorded = true;
        return { code: this.itemClass.code, values: this.values() };
    }

    /** The item in the text format of the edits, see `formatItem`. */
    public toString(): string {
        return formatItem(this.toEntity());
    }

    /** Values of the item, see `ItemEntity`: its position, rounded, by default. */
    protected values(): number[] {
        return [Math.round(this.pos.x), Math.round(this.pos.y)];
    }

    /** Applies the item effect, called when a bike part touches the item. */
    protected onTouch(_part: Collidable): void {}

    protected onAdd(): void {
        this.grid.totalObjects.set(this.id, this);
    }

    protected onDelete(): void {
        this.grid.totalObjects.delete(this.id);
    }

    public static createInstance(values: number[], track: Track): Item {
        const ItemConstructor = this as unknown as new (pos: Vector, track: Track) => Item;
        return new ItemConstructor(itemPosition(values), track);
    }
}
