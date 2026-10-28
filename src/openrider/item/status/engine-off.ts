import type { ItemShape } from '../item-sprite';
import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Cuts the engine of the bike, which can no longer accelerate. */
export class EngineOff extends StatusItem {
    public static override readonly itemName: string = 'Engine Off';
    public static override readonly color: string = '#f5a';
    public static override readonly reachedColor: string = '#faf';
    public static override readonly code: string = 'E';

    public override get sprite(): ItemShape {
        return 'octagon';
    }

    public override onReach(part: Collidable): void {
        part.bike.engineValueScale = 0;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.ENGINE_OFF, MODIFIER_GROUPS.ENGINE);
    }
}
