import type { Collidable } from '../../entity/collidable';
import { MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Prevents the bike from crashing. */
export class Invincibility extends StatusItem {
    public static override readonly itemName: string = 'Invincibility';
    public static override readonly color: string = '#55f';
    public static override readonly reachedColor: string = '#aaf';
    public static override readonly code: string = 'I';

    public override onReach(part: Collidable): void {
        part.bike.runner.modifiersMask |= MODIFIERS.INVINCIBILITY;
    }
}
