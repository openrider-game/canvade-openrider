import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Grid } from '../../grid/grid';
import type { Track } from '../../track/track';
import { TrackObject } from '../track-object';

/** Constructor of the line classes. */
export interface LineClass {
    new (pos: Vector, endPos: Vector, track: Track): Line;
}

/**
 * Segment of the track, going from {@link TrackObject.pos} to {@link TrackObject.endPos}.
 *
 * Lines are drawn in the cached images of the render cells rather than on every frame.
 */
export abstract class Line extends TrackObject {
    /** Vector from the start to the end of the line. */
    public readonly vector: Vector;
    /** Length of the line, in world units. */
    public readonly len: number;
    /**
     * Set once the line was checked against the current part, as a line spanning several
     * cells must only collide once. Reset by `PhysicsCell.untouch`.
     */
    public touched = false;

    public constructor(pos: Vector, endPos: Vector, track: Track) {
        super(pos, track);

        this.endPos = endPos;
        this.vector = this.endPos.sub(this.pos);
        this.len = this.vector.getLength();
    }

    public touch(_part: Collidable): void {}

    public checkDelete(eraserPoint: Vector, radius: number): Line | null {
        if (!this.onTrack) {
            return null;
        }

        // Closest point of the line to the eraser
        const eraserToPosDistance = eraserPoint.sub(this.pos);
        const normalizedVector = this.vector.recipScale(this.len);
        const normalizedDirection = eraserToPosDistance.dot(normalizedVector);
        const posToCheck = new Vector();

        if (normalizedDirection <= 0) {
            posToCheck.set(this.pos);
        } else if (normalizedDirection >= this.len) {
            posToCheck.set(this.endPos);
        } else {
            posToCheck.set(this.pos.add(normalizedVector.scale(normalizedDirection)));
        }

        if (eraserPoint.sub(posToCheck).getLength() <= radius) {
            this.removeFromTrack();
            return this;
        }

        return null;
    }

    /**
     * Serializes the end of the line, followed by the lines connected to it.
     *
     * A polyline is thus exported as a single list of points, every chained line being marked as
     * recorded so that it is not exported again on its own.
     */
    private getEnd(): string {
        this.recorded = true;
        let end = ' ' + this.endPos.toString();
        const gridCoords = Grid.gridCoords(this.endPos, this.grid.cellSize);
        const next = this.grid.cell(gridCoords.x, gridCoords.y).search(this.endPos, this.kind);
        if (next) {
            end += next.getEnd();
        }

        return end;
    }

    /** Serializes the line and the lines chained after it, as a list of base 32 points. */
    public toString(): string {
        return this.pos.toString() + this.getEnd();
    }
}
