import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Gravity factor of the low gravity: the bike jumps higher and further. */
export const LOW_GRAVITY_SCALE = 0.4;

/**
 * Lowers the gravity of the bike, as on the moon, until a reset item. Replaces the other gravity
 * effects, the gravity direction being kept.
 */
export class LowGravity extends StatusItem {
    public static override readonly itemName: string = 'Low Gravity';
    public static override readonly color: string = '#c9f';
    public static override readonly reachedColor: string = '#ecf';
    public static override readonly code: string = 'F';

    public override onReach(part: Collidable): void {
        part.bike.gravityValueScale = LOW_GRAVITY_SCALE;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.LOW_GRAVITY, MODIFIER_GROUPS.GRAVITY);
    }
}
