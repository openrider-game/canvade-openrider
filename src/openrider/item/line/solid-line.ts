import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import { Line } from './line';
import { LineStore } from './line-store';

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
        this.grid.totalSolidLines.added(this);
    }

    protected onDelete(): void {
        this.grid.totalSolidLines.removed();
    }

    /**
     * Collides a part with the line, where its command block puts it for the runner of the part
     * (see `CommandBlock.offsetFor`): nowhere while it is hidden, or moved by an offset.
     */
    public override touch(part: Collidable): void {
        if (this.slot >= 0) {
            SolidLine.touchSlot(this.store, this.slot, part);
            return;
        }

        // Off the track, e.g. a line checked by the tests
        const data = this.detached!;
        const command = data.command;
        const offset = command === null ? null : command.offsetFor(part.bike.runner);
        if (command !== null && offset === null) {
            return;
        }
        if (offset) {
            part.pos.selfSub(offset);
        }
        if (data.touchedPass !== Line.currentPass) {
            data.touchedPass = Line.currentPass;
            SolidLine.collide(data.x1, data.y1, data.x2, data.y2, data.len, part);
        }
        if (offset) {
            part.pos.selfAdd(offset);
        }
    }

    /**
     * Collides a part with the line of a slot, where its command block puts it for the runner of
     * the part, as {@link SolidLine.touch}: read from the columns of the store, allocating
     * nothing.
     */
    public static touchSlot(
        store: LineStore,
        slot: number,
        part: Collidable,
        pass = Line.currentPass,
    ): void {
        // Most tracks bind no line to a command block
        const command = store.commands.size ? store.commands.get(slot) : undefined;
        if (command === undefined) {
            SolidLine.collideSlot(store, slot, part, pass);
            return;
        }

        const offset = command.offsetFor(part.bike.runner);
        if (offset === null) {
            return;
        }
        // Moving the part the other way is moving the line, without changing its cells
        part.pos.selfSub(offset);
        SolidLine.collideSlot(store, slot, part, pass);
        part.pos.selfAdd(offset);
    }

    private static collideSlot(
        store: LineStore,
        slot: number,
        part: Collidable,
        pass: number,
    ): void {
        // A line can span several cells, it must only collide once each time a part is checked
        if (store.touchedPass[slot] === pass) {
            return;
        }
        store.touchedPass[slot] = pass;
        SolidLine.collide(
            store.x1[slot],
            store.y1[slot],
            store.x2[slot],
            store.y2[slot],
            store.len[slot],
            part,
        );
    }

    /**
     * Pushes a part out of a line from its start to its end, of a length, and makes it drive
     * along it.
     *
     * In plain numbers rather than vectors, allocating nothing on every check, with the same
     * operations in the same order as with vectors: the recorded ghosts depend on every bit of the
     * results.
     */
    private static collide(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        len: number,
        part: Collidable,
    ): void {
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

LineStore.factories.solid = (track, slot) =>
    Line.bindSlot(new SolidLine(new Vector(), new Vector(), track), slot);
