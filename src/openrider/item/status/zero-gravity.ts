import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/**
 * Cancels the gravity of the bike, which keeps its momentum until a reset item.
 *
 * The gravity direction is kept, so that a reset item restores the gravity set by the last
 * gravity item.
 */
export class ZeroGravity extends StatusItem {
    public static override readonly itemName: string = 'Zero Gravity';
    public static override readonly color: string = '#5ff';
    public static override readonly reachedColor: string = '#aff';
    public static override readonly code: string = 'Z';

    public override onReach(part: Collidable): void {
        part.bike.gravityValueScale = 0;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.ZERO_GRAVITY, MODIFIER_GROUPS.GRAVITY);
    }
}
