import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Line } from '../../item/line/line';
import { type LineStore, ON_TRACK, RECORDED } from '../../item/line/line-store';
import { SolidLine } from '../../item/line/solid-line';
import type { TrackObject, TrackObjectKind } from '../../item/track-object';
import { Cell } from './cell';

/** Kinds of objects the eraser can delete on a layer. */
export type EraserRestriction = Record<TrackObjectKind, boolean>;

/** Changed each time an item gets or loses its command block, see {@link PhysicsCell.reach}. */
let commandsVersion = 0;

/** Cell of the physics grid, used for collisions, erasing and exports. */
export class PhysicsCell extends Cell {
    /**
     * Positions of the items as `[x, y, radius², ...]`, in the order of {@link Cell.objects}, the
     * radius being NaN for an item touched elsewhere (see `Item.touchRadiusSquared`); null until
     * the items collide, and once they change.
     */
    private reach: Float64Array | null = null;
    /** Version of the commands {@link PhysicsCell.reach} was made with. */
    private reachVersion = -1;
    /**
     * Boxes of the solid lines as `[left, top, right, bottom, ...]`, in the order of
     * {@link Cell.lines}, NaN for a line collided elsewhere, moved or hidden by its command block;
     * null until the lines collide, and once they change.
     */
    private boxes: Float64Array | null = null;
    /** Version of the commands {@link PhysicsCell.boxes} was made with. */
    private boxesVersion = -1;

    /** Tells the cells that an item got or lost its command block, its reach changing. */
    public static commandsChanged(): void {
        commandsVersion++;
    }

    protected override clear(): void {
        this.reach = null;
        this.boxes = null;
    }

    /**
     * Collides a part with the lines then the items of the cell, in reverse order of insertion:
     * the recorded ghosts depend on this order. Items are skipped once the runner is dead.
     *
     * The items out of reach are skipped from the positions packed in {@link PhysicsCell.reach},
     * read in a row rather than item by item: on a track crowded with items, most of the
     * collision time. The items in reach check it again in `Item.touch`, so that they are touched
     * exactly as without it.
     */
    public touch(part: Collidable): void {
        this.touchLines(part);
        if (part.bike.runner.dead) {
            return;
        }

        const reach = this.itemReach();
        for (let i = this.objects.length - 1; i >= 0; i--) {
            // The items changed while touched, e.g. one removed: touched as they are
            if (this.reach !== reach) {
                this.objects[i].touch(part);
                continue;
            }
            const radius = reach[i * 3 + 2];
            // Read again for each item: an item touched can move the part, e.g. a boost
            const dx = part.pos.x - reach[i * 3];
            const dy = part.pos.y - reach[i * 3 + 1];
            if (!(dx * dx + dy * dy >= radius)) {
                this.objects[i].touch(part);
            }
        }
    }

    /**
     * Collides a part with the solid lines, in reverse order of insertion. A line too far from the
     * part to move it, from its box packed in {@link PhysicsCell.boxes}, is only marked as
     * collided (`Line.touched`), as `SolidLine.collide` does: it collides only with a part within
     * its size of the line, or having crossed it during the last update, so within its velocity.
     * The lines in reach collide as without it.
     */
    private touchLines(part: Collidable): void {
        const slots = this.lineSlots;
        const store = this.store;
        if (!slots.length || !store) {
            return;
        }
        const boxes = this.lineBoxes();
        // The pass of the part on this layer, the same for every line of the cell
        const pass = Line.currentPass;
        const touchedPass = store.touchedPass;
        // Larger than the size and the velocity of the part, by a margin for the rounding
        const reach =
            Math.max(part.size, Math.abs(part.velocity.x) + Math.abs(part.velocity.y)) + 1;
        for (let i = slots.length - 1; i >= 0; i--) {
            const slot = slots[i];
            // The lines changed while colliding: collided as they are
            if (this.boxes !== boxes) {
                SolidLine.touchSlot(store, slot, part, pass);
                continue;
            }
            const box = i * 4;
            // Read again for each line: a line colliding moves the part
            const { x, y } = part.pos;
            if (
                x < boxes[box] - reach ||
                y < boxes[box + 1] - reach ||
                x > boxes[box + 2] + reach ||
                y > boxes[box + 3] + reach
            ) {
                // Out of reach, as `SolidLine.collide` finds it, colliding once a check
                touchedPass[slot] = pass;
            } else {
                // In reach, or NaN for a line collided elsewhere
                SolidLine.touchSlot(store, slot, part, pass);
            }
        }
    }

    /** The packed boxes of the solid lines, made again once they or their commands change. */
    private lineBoxes(): Float64Array {
        if (this.boxes === null || this.boxesVersion !== commandsVersion) {
            const slots = this.lineSlots;
            const store = this.store!;
            const boxes = new Float64Array(slots.length * 4);
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                const box = i * 4;
                // Off the track, e.g. erased during a batch, or bound to a command block
                if (!(store.flags[slot] & ON_TRACK) || store.commands.has(slot)) {
                    boxes.fill(NaN, box, box + 4);
                    continue;
                }
                const [x1, y1, x2, y2] = [
                    store.x1[slot],
                    store.y1[slot],
                    store.x2[slot],
                    store.y2[slot],
                ];
                boxes[box] = Math.min(x1, x2);
                boxes[box + 1] = Math.min(y1, y2);
                boxes[box + 2] = Math.max(x1, x2);
                boxes[box + 3] = Math.max(y1, y2);
            }
            this.boxes = boxes;
            this.boxesVersion = commandsVersion;
        }
        return this.boxes;
    }

    /** The packed positions of the items, made again once they or their commands change. */
    private itemReach(): Float64Array {
        if (this.reach === null || this.reachVersion !== commandsVersion) {
            const objects = this.objects;
            const reach = new Float64Array(objects.length * 3);
            for (let i = 0; i < objects.length; i++) {
                reach[i * 3] = objects[i].pos.x;
                reach[i * 3 + 1] = objects[i].pos.y;
                reach[i * 3 + 2] = objects[i].touchRadiusSquared ?? NaN;
            }
            this.reach = reach;
            this.reachVersion = commandsVersion;
        }
        return this.reach;
    }

    /**
     * Finds a line of the given kind and color starting at the given point that was not exported
     * yet.
     */
    public search(point: Vector, kind: TrackObjectKind, color = 0): Line | undefined {
        const slot = this.searchSlot(point.x, point.y, kind, color);
        return slot < 0 ? undefined : this.store!.handle(slot);
    }

    /** Slot of the line {@link PhysicsCell.search} finds, -1 without one. */
    public searchSlot(x: number, y: number, kind: TrackObjectKind, color = 0): number {
        const store = this.store;
        const slots =
            kind === 'scenery' ? this.scenerySlots : kind === 'solid' ? this.lineSlots : [];
        if (!store) {
            return -1;
        }
        for (const slot of slots) {
            if (
                store.x1[slot] === x &&
                store.y1[slot] === y &&
                store.color[slot] === color &&
                !(store.flags[slot] & RECORDED)
            ) {
                return slot;
            }
        }
        return -1;
    }

    /**
     * Removes from the track the objects of the cell within the eraser radius.
     *
     * @param restrict - Kinds of objects the eraser can delete.
     * @returns The removed objects.
     */
    public checkDelete(
        eraserPoint: Vector,
        radius: number,
        restrict: EraserRestriction,
    ): TrackObject[] {
        const deleted: TrackObject[] = [];
        const store = this.store;
        // The lines read from the store, made objects only once erased
        const slots = [
            ...(restrict.solid ? this.lineSlots : []),
            ...(restrict.scenery ? this.scenerySlots : []),
        ];
        for (const slot of slots) {
            if (store && PhysicsCell.erases(store, slot, eraserPoint, radius)) {
                const line = store.handle(slot);
                line.removeFromTrack();
                deleted.push(line);
            }
        }
        for (const item of restrict.item ? [...this.objects] : []) {
            const deletedObj = item.checkDelete(eraserPoint, radius);
            if (deletedObj) {
                deleted.push(deletedObj);
            }
        }

        return deleted;
    }

    /**
     * Whether the eraser reaches the line of a slot on the track, as `Line.checkDelete` finds it:
     * the closest point of the line within its radius.
     */
    private static erases(
        store: LineStore,
        slot: number,
        eraserPoint: Vector,
        radius: number,
    ): boolean {
        if (!(store.flags[slot] & ON_TRACK)) {
            return false;
        }
        const [x1, y1, x2, y2, len] = [
            store.x1[slot],
            store.y1[slot],
            store.x2[slot],
            store.y2[slot],
            store.len[slot],
        ];
        // The unit vector of the line, and the distance along it to the closest point
        const unitX = (x2 - x1) / len;
        const unitY = (y2 - y1) / len;
        const along = (eraserPoint.x - x1) * unitX + (eraserPoint.y - y1) * unitY;
        let [closestX, closestY] = [x1, y1];
        if (along >= len) {
            [closestX, closestY] = [x2, y2];
        } else if (along > 0) {
            [closestX, closestY] = [x1 + unitX * along, y1 + unitY * along];
        }
        const dx = eraserPoint.x - closestX;
        const dy = eraserPoint.y - closestY;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
    }
}
