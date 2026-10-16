import type { BikeRunner } from '../../bike/runner/bike-runner';
import { ReachableItem } from '../reachable-item';

/** Saves the runner state, restarting the track goes back to the last checkpoint reached. */
export class Checkpoint extends ReachableItem {
    public static override readonly itemName: string = 'Checkpoint';
    public static override readonly color: string = '#00f';
    public static override readonly reachedColor: string = '#aaf';
    public static override readonly code: string = 'C';

    public override reachBy(runner: BikeRunner): void {
        runner.hitCheckpoint(this);
    }
}
