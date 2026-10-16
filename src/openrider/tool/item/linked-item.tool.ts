import { Vector } from 'canvade';
import { LinkedItem, LinkedItemClass } from '../../item/linked-item';
import { LinkedItemGroup } from '../../item/linked-item-group';
import { ItemTool } from './item.tool';

/** Places a group of linked items (e.g. teleporters), one click per item. */
export abstract class LinkedItemTool extends ItemTool {
    protected abstract override get itemClass(): LinkedItemClass;

    public override alwaysRender = true;

    /** World positions of the items of the group already clicked, not placed yet. */
    private posToCreate: Vector[] = [];

    public override activate(): void {
        super.activate();
        this.posToCreate = [];
    }

    protected createItem(pos: Vector): LinkedItem {
        return new this.itemClass(pos, this.track);
    }

    private createGroup(): void {
        const group = new LinkedItemGroup(this.track);

        for (const pos of this.posToCreate) {
            const item = this.createItem(pos);
            item.group = group;
            group.instances.push(item);
        }

        this.place(group);
    }

    public override onMouseDown(): void {
        const itemCount = this.itemClass.itemCount;

        if (this.posToCreate.length < itemCount) {
            this.posToCreate.push(this.track.mousePos.clone());
        }

        if (this.posToCreate.length === itemCount) {
            this.createGroup();
            this.posToCreate = [];
        }
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        if (this.track.mouseIn) {
            super.render(ctx);
        }

        // Items already clicked, linked to each other and to the mouse
        let previous: Vector | null = null;
        for (const posToCreate of this.posToCreate) {
            const pos = this.track.toPixel(posToCreate);
            if (previous) {
                this.renderLink(ctx, previous, pos);
            }
            this.renderPreview(ctx, pos);
            previous = pos;
        }

        if (previous) {
            this.renderLink(ctx, previous, this.track.toPixel(this.track.mousePos));
        }
        ctx.restore();
    }

    private renderLink(ctx: CanvasRenderingContext2D, a: Vector, b: Vector): void {
        ctx.strokeStyle = '#f00';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
}
