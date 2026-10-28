import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import type { Line } from '../../item/line/line';
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

    /** Tells the cells that an item got or lost its command block, its reach changing. */
    public static commandsChanged(): void {
        commandsVersion++;
    }

    protected override clear(): void {
        this.reach = null;
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
        for (let i = this.lines.length - 1; i >= 0; i--) {
            this.lines[i].touch(part);
        }
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

    /** Clears the touched flag of the lines, before checking a part against them. */
    public untouch(): void {
        for (const line of this.lines) {
            line.touched = false;
        }
    }

    /**
     * Finds a line of the given kind and color starting at the given point that was not exported
     * yet.
     */
    public search(point: Vector, kind: TrackObjectKind, color = 0): Line | undefined {
        const lines: Line[] =
            kind === 'scenery' ? this.scenery : kind === 'solid' ? this.lines : [];

        return lines.find(
            (line) =>
                line.pos.x === point.x &&
                line.pos.y === point.y &&
                line.color === color &&
                !line.recorded,
        );
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
        const candidates: TrackObject[] = [
            ...(restrict.solid ? this.lines : []),
            ...(restrict.scenery ? this.scenery : []),
            ...(restrict.item ? this.objects : []),
        ];

        for (const candidate of candidates) {
            const deletedObj = candidate.checkDelete(eraserPoint, radius);
            if (deletedObj) {
                deleted.push(deletedObj);
            }
        }

        return deleted;
    }
}
