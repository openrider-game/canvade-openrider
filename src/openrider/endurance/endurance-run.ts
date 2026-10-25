import { GhostParser } from '../parser/ghost-parser';
import type { EnduranceCourse } from './endurance-course';
import { BeatenRecords, EnduranceRecords, EnduranceResult } from './endurance-records';
import type { EnduranceRider } from './endurance-rider';

/** State of the upload of a run to the leaderboard of its track, see `EnduranceService`. */
export type RunUpload =
    | { state: 'none' }
    | { state: 'saving' }
    // Rank 0 while the run waits for an admin
    | { state: 'saved'; rank: number }
    | { state: 'refused'; reason: string };

/**
 * Run of the player in endurance mode: follows the course and the run of the player on it (see
 * {@link EnduranceCourse.step}), and keeps its result in the records once the rider fell.
 *
 * A new run starts whenever the runners restart: restarting, switching bikes, changing the track
 * or adding a ghost all put new bikes at the start.
 */
export class EnduranceRun {
    /** Result of the run once it is over, null while riding. */
    public result: EnduranceResult | null = null;
    /** Records the result beat. */
    public beaten: BeatenRecords = { overall: false, track: false };
    /** Ghost string of the run once it is over, to upload it. */
    public ghostString: string | null = null;
    /** Upload of the result to the leaderboard of the track. */
    public upload: RunUpload = { state: 'none' };

    /** Run of the player on the course, null before the first physics tick of the run. */
    private rider: EnduranceRider | null = null;

    public constructor(
        public readonly course: EnduranceCourse,
        public readonly records: EnduranceRecords,
    ) {}

    /** Distance of the run, in meters, the furthest the bike went. */
    public get distance(): number {
        return this.rider?.distance ?? 0;
    }

    /** Time of the run, in physics ticks, until the rider fell. */
    public get time(): number {
        return this.rider?.time ?? 0;
    }

    public get over(): boolean {
        return this.result !== null;
    }

    /**
     * Follows the course and the run, called on every physics tick after the runners.
     *
     * @returns Whether the run just ended.
     */
    public update(): boolean {
        this.course.step();

        const rider = this.course.riderOf(this.course.track.playerRunner);
        if (rider !== this.rider) {
            this.start(rider);
        }
        if (rider === null || !rider.over || this.over) {
            return false;
        }

        this.end(rider);
        return true;
    }

    private start(rider: EnduranceRider | null): void {
        this.rider = rider;
        this.result = null;
        this.beaten = { overall: false, track: false };
        this.ghostString = null;
        this.upload = { state: 'none' };
    }

    private end(rider: EnduranceRider): void {
        this.result = { distance: rider.distance, time: rider.time, seed: this.course.seed };
        this.beaten = this.records.submit(this.result);
        // The inputs until the last tick alive, as the backend replays them
        this.ghostString = GhostParser.generate(rider.runner, rider.time);
    }
}
