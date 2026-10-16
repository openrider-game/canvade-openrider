import type { Collidable } from '../../entity/collidable';
import { Item } from '../item';

/** Makes the bike explode. */
export class Bomb extends Item {
    public static override readonly itemName: string = 'Bomb';
    public static override readonly color: string = '#f00';
    public static override readonly code: string = 'O';

    protected override onTouch(part: Collidable): void {
        part.bike.runner.explode(this.pos, part.velocity);
    }
}
