import type { Bike } from '../bike/bike';
import type { EnduranceCourse } from './endurance-course';
import { BeatenRecords, EnduranceRecords, EnduranceResult } from './endurance-records';

/**
 * Run of the player in endurance mode: follows the bike along the course, ends the run when the
 * rider crashes or falls into a gap, and keeps its result in the records.
 *
 * A new run starts whenever the player gets a new bike: restarting, switching bikes, or changing
 * the track all put a new bike at the start.
 */
export class EnduranceRun {
    /** Distance of the run, in meters, the furthest the bike went. */
    public distance = 0;
    /** Time of the run, in physics ticks, until the rider fell. */
    public time = 0;
    /** Result of the run once it is over, null while riding. */
    public result: EnduranceResult | null = null;
    /** Records the result beat. */
    public beaten: BeatenRecords = { overall: false, track: false };

    /** Bike of the run, to tell when a new one starts. */
    private bike: Bike | null = null;
    /** Last position of the bike, the course following it after an explosion too. */
    private lastX: number;

    public constructor(
        public readonly course: EnduranceCourse,
        public readonly records: EnduranceRecords,
    ) {
        this.lastX = course.track.origin.x;
    }

    public get over(): boolean {
        return this.result !== null;
    }

    /** Follows the run, called on every physics tick after the runners. */
    public update(): void {
        const track = this.course.track;
        const runner = track.playerRunner;
        const bike = runner.instance;

        if (bike !== null && bike !== this.bike && !runner.dead) {
            this.start(bike);
        }
        if (bike !== null) {
            this.lastX = bike.hitbox.pos.x;
        }
        this.course.update(this.lastX);

        // Over, or no bike yet
        if (this.over || (bike === null && !runner.dead)) {
            return;
        }

        // Falling into a gap ends the run as a crash would
        if (
            bike !== null &&
            !runner.dead &&
            bike.hitbox.pos.y > this.course.fallLimitAt(this.lastX)
        ) {
            runner.crash();
        }

        if (!runner.dead && bike !== null) {
            this.distance = Math.max(this.distance, this.course.distanceAt(this.lastX));
            this.time = track.time;
        } else {
            this.end();
        }
    }

    private start(bike: Bike): void {
        this.bike = bike;
        this.distance = 0;
        this.time = 0;
        this.result = null;
        this.beaten = { overall: false, track: false };
    }

    private end(): void {
        this.result = { distance: this.distance, time: this.time, seed: this.course.seed };
        this.beaten = this.records.submit(this.result);
    }
}
