import type { Collidable } from '../../entity/collidable';
import { StatusItem } from '../status-item';

/** Removes every status effect from the bike. */
export class Reset extends StatusItem {
    public static override readonly itemName: string = 'Reset';
    public static override readonly color: string = '#5f5';
    public static override readonly reachedColor: string = '#afa';
    public static override readonly code: string = 'R';

    public override onReach(part: Collidable): void {
        part.bike.friction = 0.99;
        part.bike.backWheel.motor = 0.3;
        part.bike.frontWheel.motor = 0.3;

        part.bike.engineValueScale = 1;
        part.bike.speedValueScale = 1;
        part.bike.steerValueScale = 1;

        part.bike.runner.modifiersMask = 0;
    }
}
