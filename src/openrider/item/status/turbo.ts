import type { ItemShape } from '../item-sprite';
import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Engine factor of the turbo: the bike accelerates to a higher speed. */
export const TURBO_ENGINE_SCALE = 1.5;

/**
 * Powers up the engine of the bike, which reaches a higher speed, until a reset item. Replaces
 * the engine off effect.
 */
export class Turbo extends StatusItem {
    public static override readonly itemName: string = 'Turbo';
    public static override readonly color: string = '#f90';
    public static override readonly reachedColor: string = '#fc8';
    public static override readonly code: string = 'U';

    public override get sprite(): ItemShape {
        return 'diamond';
    }

    public override onReach(part: Collidable): void {
        part.bike.engineValueScale = TURBO_ENGINE_SCALE;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.TURBO, MODIFIER_GROUPS.ENGINE);
    }
}
