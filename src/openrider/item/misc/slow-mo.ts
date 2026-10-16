import type { Collidable } from '../../entity/collidable';
import { Item } from '../item';

/** Slows the bike down until both its wheels touch the ground. */
export class SlowMo extends Item {
    public static override readonly itemName: string = 'Slow-Motion';
    public static override readonly color: string = '#eee';
    public static override readonly code: string = 'S';

    protected override onTouch(part: Collidable): void {
        part.bike.setSlow(true);
    }
}
