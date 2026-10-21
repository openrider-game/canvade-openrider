import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import type { Line } from '../../item/line/line';
import type { TrackObject, TrackObjectKind } from '../../item/track-object';
import { Cell } from './cell';

/** Kinds of objects the eraser can delete on a layer. */
export type EraserRestriction = Record<TrackObjectKind, boolean>;

/** Cell of the physics grid, used for collisions, erasing and exports. */
export class PhysicsCell extends Cell {
    /**
     * Collides a part with the lines then the items of the cell, in reverse order of insertion:
     * the recorded ghosts depend on this order. Items are skipped once the runner is dead.
     */
    public touch(part: Collidable): void {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            this.lines[i].touch(part);
        }
        if (!part.bike.runner.dead) {
            for (let i = this.objects.length - 1; i >= 0; i--) {
                this.objects[i].touch(part);
            }
        }
    }

    /** Clears the touched flag of the lines, before checking a part against them. */
    public untouch(): void {
        for (const line of this.lines) {
            line.touched = false;
        }
    }

    /** Finds a line of the given kind starting at the given point that was not exported yet. */
    public search(point: Vector, kind: TrackObjectKind): Line | undefined {
        const lines: Line[] =
            kind === 'scenery' ? this.scenery : kind === 'solid' ? this.lines : [];

        return lines.find(
            (line) => line.pos.x === point.x && line.pos.y === point.y && !line.recorded,
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
