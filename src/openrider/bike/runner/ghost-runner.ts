import { GhostParser } from '../../parser/ghost-parser';
import type { Track } from '../../track/track';
import { ReplayRunner } from './replay-runner';

/**
 * Replays a recorded run: the controls toggle at the times of the run stored in the ghost string.
 *
 * Ghosts start and restart with the player, and save a checkpoint when the player does.
 */
export class GhostRunner extends ReplayRunner {
    /** Time of the recorded run, in physics ticks. */
    public readonly finalTime: number;

    /**
     * Parses the ghost string. The bike is only created by {@link GhostRunner.createBike}.
     *
     * @param ghostString - Recorded run, in the format read by {@link GhostParser}.
     * @param randomColor - Whether the ghost gets a random dark color, false for a preview.
     */
    public constructor(track: Track, ghostString: string, randomColor = true) {
        const ghost = GhostParser.parse(ghostString);

        super(track, ghost.bike, ghost.name, ghost.keys, randomColor);

        this.finalTime = ghost.time;
    }

    /** The time of the recorded run: the last tick alive. */
    public override get lastTick(): number {
        return this.finalTime;
    }

    protected override onHitTarget(): void {
        if (this.targetsReached.size >= this.track.targets.size) {
            this.done = true;
        }
    }
}
