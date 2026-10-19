import { Vector } from 'canvade';
import type { Item } from '../../item/item';
import type { Track } from '../../track/track';
import { Tool } from '../tool';

/** Constructor of an item built from its position only. */
export interface PlaceableItemClass {
    new (pos: Vector, track: Track): Item;
    /** Fill color of the item, also used by the tool preview. */
    readonly color: string;
}

/** Places an item at the mouse position on click, on the item layer of the track. */
export abstract class ItemTool extends Tool {
    /** Class of the placed item. */
    protected abstract get itemClass(): { readonly color: string };

    /**
     * Creates the item to place.
     *
     * @param pos - Position of the item, in world units.
     */
    protected abstract createItem(pos: Vector): Item;

    public override onMouseDown(): void {
        const item = this.createItem(this.track.mousePos.clone());
        this.place(item);
    }

    /**
     * Adds an item to the item layer of the track (the active layer, or the closest main layer
     * under it), as an action that can be undone.
     */
    protected place(item: Item): void {
        const layers = this.track.layers;
        item.layer = layers.reveal(layers.itemLayer);
        item.addToTrack();
        this.track.history.push({
            undo: () => item.removeFromTrack(),
            redo: () => item.addToTrack(),
        });
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.track.mousePos);
        this.renderPreview(ctx, pos);
    }

    /**
     * Draws the preview of an item.
     *
     * @param pos - Position of the item, in canvas pixels.
     */
    protected renderPreview(ctx: CanvasRenderingContext2D, pos: Vector): void {
        const zoom = this.track.zoomFactor;
        ctx.fillStyle = this.itemClass.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7 * zoom, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
}

/** Item tool for items built from a position only. */
export abstract class SimpleItemTool extends ItemTool {
    protected abstract override get itemClass(): PlaceableItemClass;

    protected createItem(pos: Vector): Item {
        return new this.itemClass(pos, this.track);
    }
}
