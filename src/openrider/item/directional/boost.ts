import type { Collidable } from '../../entity/collidable';
import { DirectionalItem } from '../directional-item';

/** Pushes every point of the bike in its direction, on each physics tick it is touched. */
export class Boost extends DirectionalItem {
    public static override readonly itemName: string = 'Boost';
    public static override readonly color: string = '#ff0';
    public static override readonly code: string = 'B';

    protected override onTouch(part: Collidable): void {
        for (const point of part.bike.points) {
            point.pos.selfAdd(this.direction);
        }
    }
}
