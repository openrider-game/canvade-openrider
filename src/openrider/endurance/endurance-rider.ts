import type { BikeRunner } from '../bike/runner/bike-runner';
import { BACK_LIMIT } from './endurance.constants';
import type { EnduranceCourse } from './endurance-course';

/**
 * Run of a runner on the endurance course, the player or a ghost: its progress, and the rules
 * ending it. The ghosts follow the same rules as the player, so that they end their runs where
 * they were ridden, and the backend replays a run as it was ridden (see `GhostVerifier`).
 *
 * The run of a runner only depends on its own inputs: the sections a bike can reach are always
 * on the track, whatever the other runners do (see {@link EnduranceCourse.step}).
 */
export class EnduranceRider {
    /** Furthest position the bike reached. */
    public furthestX: number;
    /** Distance of the run, in meters, to the furthest position. */
    public distance = 0;
    /** Time of the run, in physics ticks, the last tick the rider was alive. */
    public time = 0;
    /** Whether the run is over: crashed, exploded, fallen into a gap or ridden back too far. */
    public over = false;

    public constructor(
        public readonly runner: BikeRunner,
        private readonly course: EnduranceCourse,
    ) {
        this.furthestX = course.track.origin.x;
    }

    /** Follows the runner after a physics tick, ending its run once the rider is dead. */
    public update(): void {
        const bike = this.runner.instance;
        if (this.over) {
            return;
        }

        // Fallen into a gap, or back where the track may be gone: the run cannot go on, even
        // for an invincible rider
        const pos = bike?.hitbox.pos;
        if (
            pos &&
            !this.runner.dead &&
            (pos.y > this.course.fallLimitAt(pos.x) || pos.x < this.furthestX - BACK_LIMIT)
        ) {
            this.runner.crash(true);
        }

        // Crashed, or exploded on a bomb, which takes the bike away
        if (this.runner.dead || !pos) {
            this.over = this.runner.dead;
            return;
        }
        this.furthestX = Math.max(this.furthestX, pos.x);
        this.distance = this.course.distanceAt(this.furthestX);
        this.time = this.course.track.time;
    }
}
