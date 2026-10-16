import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Line } from './line';

/** Line the bikes ride on. */
export class SolidLine extends Line {
    public readonly kind = 'solid';

    protected onAdd(): void {
        this.grid.totalSolidLines.set(this.id, this);
    }

    protected onDelete(): void {
        this.grid.totalSolidLines.delete(this.id);
    }

    public override touch(part: Collidable): void {
        // A line can span several cells, it must only collide once each time a part is checked
        if (this.touched) {
            return;
        }
        this.touched = true;

        let vectorToPart: Vector | null = null;
        const posDistance = part.pos.sub(this.pos);
        const relativePosOnLine = posDistance.dot(this.vector) / this.len / this.len;
        let passedThrough = 1;

        // The part is directly above or below the line
        if (relativePosOnLine >= 0 && relativePosOnLine <= 1) {
            const diffVel = posDistance.sub(part.velocity);
            const perpendicularPosCross =
                posDistance.x * this.vector.y - posDistance.y * this.vector.x;
            const perpendicularVelCross = diffVel.x * this.vector.y - diffVel.y * this.vector.x;
            // Negative if the part went through the line during the last position update
            passedThrough = perpendicularPosCross * perpendicularVelCross < 0 ? -1 : 1;
            vectorToPart = posDistance.sub(this.vector.scale(relativePosOnLine));
        }

        // The part is close enough to one of the line ends
        else if (
            relativePosOnLine * this.len >= -part.size &&
            relativePosOnLine * this.len <= this.len + part.size
        ) {
            const edge = relativePosOnLine > 0 ? this.endPos : this.pos;
            vectorToPart = part.pos.sub(edge);
        }

        const distanceToPart = vectorToPart ? vectorToPart.getLength() : 0;
        // Collides if the part touches the line or went through it, so that a part fast enough to
        // cross the line in a single update is still caught. It fails when the part crosses
        // several cells at once.
        if (
            vectorToPart &&
            (distanceToPart < part.size || passedThrough < 0) &&
            distanceToPart !== 0
        ) {
            part.pos.selfAdd(
                vectorToPart.scale((part.size * passedThrough - distanceToPart) / distanceToPart),
            );
            part.drive(
                new Vector(-vectorToPart.y / distanceToPart, vectorToPart.x / distanceToPart),
            );
        }
    }
}
