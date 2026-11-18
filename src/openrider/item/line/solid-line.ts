import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Line } from './line';

/**
 * Normal given to the parts colliding, see `Collidable.drive`: reused rather than allocated on
 * every collision, the parts reading it during the call only.
 */
const NORMAL = new Vector();

/** Line the bikes ride on. */
export class SolidLine extends Line {
    public get kind(): 'solid' {
        return 'solid';
    }

    protected onAdd(): void {
        this.grid.totalSolidLines.set(this.id, this);
    }

    protected onDelete(): void {
        this.grid.totalSolidLines.delete(this.id);
    }

    /**
     * Collides a part with the line, where its command block puts it for the runner of the part
     * (see `CommandBlock.offsetFor`): nowhere while it is hidden, or moved by an offset.
     */
    public override touch(part: Collidable): void {
        const command = this.command;
        if (command === null) {
            this.collide(part);
            return;
        }

        const offset = command.offsetFor(part.bike.runner);
        if (offset === null) {
            return;
        }
        // Moving the part the other way is moving the line, without changing its cells
        part.pos.selfSub(offset);
        this.collide(part);
        part.pos.selfAdd(offset);
    }

    private collide(part: Collidable): void {
        // A line can span several cells, it must only collide once each time a part is checked
        if (this.touched) {
            return;
        }
        this.touched = true;

        // In plain numbers rather than vectors, read from the columns of the lines, allocating
        // nothing on every check, with the same operations in the same order: the recorded ghosts
        // depend on every bit of the results
        const slot = this.slot;
        const store = this.store;
        const detached = this.detached;
        const startX = slot >= 0 ? store.x1[slot] : detached!.x1;
        const startY = slot >= 0 ? store.y1[slot] : detached!.y1;
        const endX = slot >= 0 ? store.x2[slot] : detached!.x2;
        const endY = slot >= 0 ? store.y2[slot] : detached!.y2;
        const len = slot >= 0 ? store.len[slot] : detached!.len;
        // The vector of the line, from its start to its end
        const vectorX = endX - startX;
        const vectorY = endY - startY;
        const pos = part.pos;
        // From the line start to the part
        const distanceX = pos.x - startX;
        const distanceY = pos.y - startY;
        const relativePosOnLine = (distanceX * vectorX + distanceY * vectorY) / len / len;
        let passedThrough = 1;
        // From the line to the part, when close enough
        let toPart = false;
        let toPartX = 0;
        let toPartY = 0;

        // The part is directly above or below the line
        if (relativePosOnLine >= 0 && relativePosOnLine <= 1) {
            const diffVelX = distanceX - part.velocity.x;
            const diffVelY = distanceY - part.velocity.y;
            const perpendicularPosCross = distanceX * vectorY - distanceY * vectorX;
            const perpendicularVelCross = diffVelX * vectorY - diffVelY * vectorX;
            // Negative if the part went through the line during the last position update
            passedThrough = perpendicularPosCross * perpendicularVelCross < 0 ? -1 : 1;
            toPart = true;
            toPartX = distanceX - vectorX * relativePosOnLine;
            toPartY = distanceY - vectorY * relativePosOnLine;
        }

        // The part is close enough to one of the line ends
        else if (
            relativePosOnLine * len >= -part.size &&
            relativePosOnLine * len <= len + part.size
        ) {
            toPart = true;
            toPartX = pos.x - (relativePosOnLine > 0 ? endX : startX);
            toPartY = pos.y - (relativePosOnLine > 0 ? endY : startY);
        }

        const distanceToPart = toPart ? Math.sqrt(toPartX * toPartX + toPartY * toPartY) : 0;
        // Collides if the part touches the line or went through it, so that a part fast enough to
        // cross the line in a single update is still caught. It fails when the part crosses
        // several cells at once.
        if (toPart && (distanceToPart < part.size || passedThrough < 0) && distanceToPart !== 0) {
            const push = (part.size * passedThrough - distanceToPart) / distanceToPart;
            pos.x += toPartX * push;
            pos.y += toPartY * push;
            NORMAL.x = -toPartY / distanceToPart;
            NORMAL.y = toPartX / distanceToPart;
            part.drive(NORMAL);
        }
    }
}
