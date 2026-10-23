import type { BikeRunner } from '../../bike/runner/bike-runner';
import { LinkedItem } from '../linked-item';

/**
 * Checkpoint linked to another one: reaching either of them saves the runner state once, and
 * marks both as reached, so that the other one cannot be taken in the same run.
 */
export class LinkedCheckpoint extends LinkedItem {
    public static override readonly itemName: string = 'Linked Checkpoint';
    public static override readonly color: string = '#08f';
    public static override readonly reachedColor: string = '#acf';
    public static override readonly code: string = 'L';

    /**
     * The group queues its checkpoints for the runner when one of them is touched, which is the
     * whole effect.
     */
    public override onReach(): void {}

    /**
     * Saves a checkpoint for the first checkpoint of the group processed by the runner, and only
     * records the others as reached.
     */
    public override reachBy(runner: BikeRunner): void {
        const siblings = this.group?.instances ?? [];
        if (siblings.some((sibling) => runner.reachablesReached.has(sibling.id))) {
            runner.hitReachable(this);
        } else {
            runner.hitCheckpoint(this);
        }
    }
}
