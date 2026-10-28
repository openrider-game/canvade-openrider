import { Vector } from 'canvade';
import { DirectionalItem, DirectionalItemClass } from '../../item/directional-item';
import { spriteCode } from '../../item/item-sprite';
import { painter } from '../../render/painter';
import { ItemTool } from './item.tool';

/**
 * Places a directional item: press on its position, and release towards its direction.
 *
 * The rotation of the item is rounded to whole degrees.
 */
export abstract class DirectionalItemTool extends ItemTool {
    protected abstract override get itemClass(): DirectionalItemClass;

    public override onMouseDown(): void {
        this.mouseDown = true;
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }

        this.mouseDown = false;

        const item = this.createItem(this.track.lastClick.clone());
        this.place(item);
    }

    private getRotation(): number {
        const { lastClick, mousePos } = this.track;
        return Math.atan2(lastClick.x - mousePos.x, mousePos.y - lastClick.y);
    }

    protected createItem(pos: Vector): DirectionalItem {
        const rotation = Math.round((this.getRotation() * 180) / Math.PI);
        return new this.itemClass(pos, rotation, this.track);
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const zoom = this.track.zoomFactor;
        const lastClick = this.track.toPixel(this.track.lastClick);
        const pos = this.track.toPixel(this.track.mousePos);

        const color = this.itemClass.color;
        const arrow = spriteCode('arrow');
        if (this.mouseDown) {
            // The arrow at the press, turned toward the mouse, with a dot at the mouse
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = Math.max(0.5, zoom * 2);
            ctx.arc(pos.x, pos.y, 3 * zoom, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            const rotation = Math.atan2(lastClick.x - pos.x, pos.y - lastClick.y);
            painter.drawItem(ctx, arrow, color, lastClick.x, lastClick.y, rotation, zoom);
        } else {
            painter.drawItem(ctx, arrow, color, pos.x, pos.y, 0, zoom);
        }
    }
}
