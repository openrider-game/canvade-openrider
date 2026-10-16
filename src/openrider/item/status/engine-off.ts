import type { Collidable } from '../../entity/collidable';
import { MODIFIERS } from '../modifiers';
import { StatusItem } from '../status-item';

/** Cuts the engine of the bike, which can no longer accelerate. */
export class EngineOff extends StatusItem {
    public static override readonly itemName: string = 'Engine Off';
    public static override readonly color: string = '#f55';
    public static override readonly reachedColor: string = '#faa';
    public static override readonly code: string = 'E';

    public override onReach(part: Collidable): void {
        part.bike.engineValueScale = 0;

        part.bike.runner.modifiersMask |= MODIFIERS.ENGINE_OFF;
    }
}
