import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import type { Track } from '../../track/track';
import { DirectionalItem } from '../directional-item';

/** Sets the gravity of the bike to its direction. */
export class Gravity extends DirectionalItem {
    public static override readonly itemName: string = 'Gravity';
    public static override readonly color: string = '#0f0';
    public static override readonly code: string = 'G';

    public constructor(pos: Vector, rotation: number, track: Track) {
        super(pos, rotation, track);
        this.direction.selfScale(0.3);
    }

    protected override onTouch(part: Collidable): void {
        part.bike.gravity.set(this.direction);
    }
}
