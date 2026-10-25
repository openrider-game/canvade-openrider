import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Gravity factor of a heavy bike: it climbs harder and falls faster. */
export const HEAVY_GRAVITY_SCALE = 1.6;

/**
 * Makes the bike heavy, gravity pulling it harder until a reset item. Replaces the other gravity
 * effects, the gravity direction being kept.
 */
export class Heavy extends StatusItem {
    public static override readonly itemName: string = 'Heavy';
    public static override readonly color: string = '#c63';
    public static override readonly reachedColor: string = '#e96';
    public static override readonly code: string = 'K';

    public override onReach(part: Collidable): void {
        part.bike.gravityValueScale = HEAVY_GRAVITY_SCALE;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.HEAVY, MODIFIER_GROUPS.GRAVITY);
    }
}
