import type { BikeRunner } from '../../bike/runner/bike-runner';
import type { Collidable } from '../../entity/collidable';
import { ReachableItem } from '../reachable-item';

/** Reaching every target of the track finishes it. */
export class Target extends ReachableItem {
    public static override readonly itemName: string = 'Target';
    public static override readonly color: string = '#ff0';
    public static override readonly reachedColor: string = '#ffa';
    public static override readonly code: string = 'T';

    /** Queues the target unless the runner already reached it as a target. */
    public override onReach(part: Collidable): void {
        if (!part.bike.runner.targetsReached.has(this.id)) {
            part.bike.runner.actionQueue.set(this.id, this);
        }
    }

    public override reachBy(runner: BikeRunner): void {
        runner.hitTarget(this);
    }

    protected override onAdd(): void {
        super.onAdd();
        this.track.targets.set(this.id, this);
    }

    protected override onDelete(): void {
        super.onDelete();
        this.track.targets.delete(this.id);
    }
}
