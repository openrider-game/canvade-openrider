import type { Collidable } from '../../entity/collidable';
import { LinkedItem } from '../linked-item';
import type { ReachableItem } from '../reachable-item';

/** Teleports the bike to the other teleporter of its group. */
export class Teleporter extends LinkedItem {
    public static override readonly itemName: string = 'Teleporter';
    public static override readonly color: string = '#f0f';
    public static override readonly reachedColor: string = '#faf';
    public static override readonly code: string = 'W';

    /**
     * Moves every point of the bike by the offset to the linked teleporter, unless the runner
     * already went through it, and moves the camera along when it follows this bike.
     */
    public override onReach(part: Collidable, linkedItem?: ReachableItem): void {
        if (linkedItem && !part.bike.runner.reachablesReached.has(this.id)) {
            const distance = linkedItem.pos.sub(this.pos);
            for (const point of part.bike.points) {
                point.pos.selfAdd(distance);
                point.oldPos.selfAdd(distance);
            }

            if (this.track.focalPoint !== null && this.track.focalPoint === part.bike.hitbox) {
                this.track.camera.set(this.track.focalPoint.pos);
            }
        }
    }
}
