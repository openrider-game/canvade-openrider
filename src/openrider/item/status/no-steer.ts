import type { ItemShape } from '../item-sprite';
import type { Collidable } from '../../entity/collidable';
import { MODIFIER_GROUPS, MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Prevents the rider from leaning the bike. */
export class NoSteer extends StatusItem {
    public static override readonly itemName: string = 'No Steer';
    public static override readonly color: string = '#ff5';
    public static override readonly reachedColor: string = '#ffa';
    public static override readonly code: string = 'N';

    public override get sprite(): ItemShape {
        return 'cross';
    }

    public override onReach(part: Collidable): void {
        part.bike.steerValueScale = 0;

        StatusItem.setModifier(part.bike.runner, MODIFIERS.NO_STEER, MODIFIER_GROUPS.STEER);
    }
}
