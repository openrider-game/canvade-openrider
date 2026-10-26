import { Vector } from 'canvade';
import type { Collidable } from '../../entity/collidable';
import type { Track } from '../../track/track';
import { DirectionalItem } from '../directional-item';

/** Speed given by a launcher in its direction, in world units per physics tick. */
export const LAUNCH_STRENGTH = 8;

/**
 * Launches the bike in its direction, once each time the bike passes over it: unlike a boost,
 * which pushes on every tick it is touched, a launcher kicks once, harder.
 *
 * A pass lasts while a part of the bike touches the launcher on every physics step (every other
 * tick in slow motion). Each runner keeps the last tick it touched each launcher at
 * (`BikeRunner.launcherTouches`), saved in its checkpoints.
 */
export class Launcher extends DirectionalItem {
    public static override readonly itemName: string = 'Launcher';
    public static override readonly color: string = '#f60';
    public static override readonly code: string = 'X';

    public constructor(pos: Vector, rotation: number, track: Track) {
        super(pos, rotation, track);
        this.direction.selfScale(LAUNCH_STRENGTH);
    }

    protected override onTouch(part: Collidable): void {
        const runner = part.bike.runner;
        const time = runner.time;
        const lastTouch = runner.launcherTouches.get(this.id);
        runner.launcherTouches.set(this.id, time);

        // Still the same pass: touched on this step or the last one, by any part of the bike
        if (lastTouch !== undefined && time - lastTouch <= 2) {
            return;
        }
        for (const point of part.bike.points) {
            point.pos.selfAdd(this.direction);
        }
    }
}
