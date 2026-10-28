import type { ItemShape } from '../item-sprite';
import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/**
 * Swaps the lean controls of the rider, left leaning forward and right backward, until a reset
 * item. Replaces the no steer effect.
 */
export class Mirror extends StatusItem {
    public static override readonly itemName: string = 'Mirror';
    public static override readonly color: string = '#f6c';
    public static override readonly reachedColor: string = '#fbe';
    public static override readonly code: string = 'M';

    public override get sprite(): ItemShape {
        return 'bowTie';
    }

    public override onReach(part: Collidable): void {
        part.bike.steerValueScale = -1;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.MIRROR, MODIFIER_GROUPS.STEER);
    }
}
