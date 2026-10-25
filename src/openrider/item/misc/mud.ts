import type { Collidable } from '../../entity/collidable';
import { Item } from '../item';

/** Part of its speed a part keeps on each physics tick it touches mud. */
export const MUD_GRIP = 0.94;

/** Slows down the parts of the bike going through it, as a patch of mud would. */
export class Mud extends Item {
    public static override readonly itemName: string = 'Mud';
    public static override readonly color: string = '#863';
    public static override readonly code: string = 'D';

    protected override onTouch(part: Collidable): void {
        // Touched while the part moves by its velocity: moving it back by a part of it slows it
        // down, its new velocity being its displacement on this tick
        part.pos.selfSub(part.velocity.scale(1 - MUD_GRIP));
    }
}
