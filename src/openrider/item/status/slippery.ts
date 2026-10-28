import type { ItemShape } from '../item-sprite';
import type { Collidable } from '../../entity/collidable';
import { MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Reduces the grip of the bike wheels. */
export class Slippery extends StatusItem {
    public static override readonly itemName: string = 'Slippery';
    public static override readonly color: string = '#999';
    public static override readonly reachedColor: string = '#aaa';
    public static override readonly code: string = 'H';

    public override get sprite(): ItemShape {
        return 'hexagon';
    }

    public override onReach(part: Collidable): void {
        part.bike.friction = 1;
        part.bike.backWheel.motor = 0.05;
        part.bike.frontWheel.motor = 0.05;
        part.bike.speedValueScale = 0.5;

        part.bike.runner.modifiersMask |= MODIFIERS.SLIPPERY;
    }
}
