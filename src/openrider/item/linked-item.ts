import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import { Item } from './item';
import { LinkedItemGroup } from './linked-item-group';
import { ReachableItem } from './reachable-item';

/** Constructor and static side of the linked item classes. */
export interface LinkedItemClass {
    new (pos: Vector, track: Track): LinkedItem;
    readonly color: string;
    readonly code: string;
    /** Number of linked items in a group. */
    readonly itemCount: number;
    /** Number of code arguments of each item of the group. */
    readonly argumentCount: number;
    /**
     * Creates the whole group from a group code, or a single item when called by the group.
     *
     * @param fromGroup - Whether the item code is the one of a single item of the group.
     */
    createInstance(itemCode: string[], track: Track, fromGroup?: boolean): Item;
}

/**
 * Item working with the other items of its group.
 *
 * Every action on one of them (adding, removing, exporting, resetting) applies to the whole
 * group: the item delegates it to its {@link LinkedItemGroup}, which then calls back each item
 * with `fromGroup` set.
 */
export abstract class LinkedItem extends ReachableItem {
    public static readonly itemCount: number = 2;
    public static readonly argumentCount: number = 2;

    public group: LinkedItemGroup | null = null;

    /**
     * Adds the whole group to the track.
     *
     * @param fromGroup - Whether the call comes from the group, adding only this item.
     */
    public override addToTrack(fromGroup = false): void {
        if (fromGroup) {
            super.addToTrack();
        } else {
            this.group?.addToTrack();
        }
    }

    /**
     * Removes the whole group from the track.
     *
     * @param fromGroup - Whether the call comes from the group, removing only this item.
     */
    public override removeFromTrack(fromGroup = false): void {
        if (fromGroup) {
            super.removeFromTrack();
        } else {
            this.group?.removeFromTrack();
        }
    }

    protected override onTouch(part: Collidable): void {
        this.group?.touchFrom(part, this);
    }

    public override resetReached(): void {
        super.resetReached();
        this.group?.resetReached();
    }

    /**
     * Serializes the whole group, marking all its items as recorded.
     *
     * @param fromGroup - Whether the call comes from the group, serializing only this item.
     */
    public override toString(fromGroup = false): string {
        if (fromGroup || !this.group) {
            return super.toString();
        }

        return this.group.serialize(this.itemClass.code);
    }

    /** Draws the links between the items of the group, over the item debug overlay. */
    public override renderDebug(ctx: CanvasRenderingContext2D): void {
        super.renderDebug(ctx);

        if (!this.group) {
            return;
        }

        ctx.save();
        ctx.strokeStyle = '#f00';
        ctx.beginPath();
        const pos = this.track.toPixel(this.pos);
        ctx.moveTo(pos.x, pos.y);
        for (const other of this.group.instances) {
            if (other !== this) {
                const otherPos = this.track.toPixel(other.pos);
                ctx.lineTo(otherPos.x, otherPos.y);
            }
        }
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Creates the whole group from a group code.
     *
     * @param fromGroup - Whether the item code is the one of a single item of the group.
     * @returns The group, or the single item when `fromGroup` is set.
     */
    public static override createInstance(
        itemCode: string[],
        track: Track,
        fromGroup = false,
    ): Item {
        if (fromGroup) {
            return super.createInstance(itemCode, track);
        }

        return LinkedItemGroup.createGroup(itemCode, track, this as unknown as LinkedItemClass);
    }
}
