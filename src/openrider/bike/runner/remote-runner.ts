import type { RunEvent } from '../../live/run-events';
import type { Track } from '../../track/track';
import type { BikeClass } from '../bike';
import { BIKE_MAP, DEFAULT_BIKE } from '../bike.constants';
import { ReplayRunner } from './replay-runner';
import { CONTROL_NAMES, ControlName } from './runner-controls';

/** Ticks received after a stall before the replay goes on, so that it does not stutter. */
export const REMOTE_BUFFER_TICKS = 5;
/** Ticks received but not replayed beyond which the replay catches up, half a second. */
export const REMOTE_MAX_LAG = 25;
/** Ticks replayed at most per physics tick while catching up, e.g. after joining a session. */
export const REMOTE_MAX_STEPS = 100;

/** Attempt of the rider, see {@link RunEvent}. */
interface Attempt {
    /** Checkpoints kept from the attempts before, the attempt starting from the last one. */
    checkpoints: number;
    bike: BikeClass;
    /** Time the attempt starts at, in physics ticks. */
    start: number;
    keys: Map<ControlName, Set<number>>;
    /** Time before which every input of the attempt was received. */
    until: number;
    /** Last tick of the attempt when the rider retired it, null otherwise. */
    retiredAt: number | null;
}

/**
 * Replays the run of another rider of a live session as it is received (see {@link RunEvent}):
 * a little late, by the time its inputs take to arrive, but never wrongly, as each tick is only
 * run once its inputs are known.
 *
 * Unlike the ghosts, it rides at its own pace: the restarts and checkpoints of the player leave
 * it alone. It saves a checkpoint when it reaches one itself, as the rider did, and starts its
 * attempts from them.
 */
export class RemoteRunner extends ReplayRunner {
    /** Time the rider reached every target at in the current attempt, null until then. */
    public finishedAt: number | null = null;
    /**
     * Set when the replay no longer matches the run of the rider: an attempt starting from a
     * checkpoint the runner did not save, or at another time. Replaying the run of the rider
     * from its start (see `RunReporter.resync`) fixes it.
     */
    public desynced = false;

    /** Attempt being replayed, null before the first one. */
    private current: Attempt | null = null;
    /** Attempts received after the current one. */
    private readonly queue: Attempt[] = [];
    /** Whether the replay waits for more inputs after a stall. */
    private buffering = true;
    /** Whether the last physics tick ran a tick of the run, for the interpolation. */
    private moved = false;

    public constructor(track: Track, name: string) {
        super(track, DEFAULT_BIKE, name, new Map());
    }

    /** The name of the rider, marked as live to tell them from the ghosts. */
    public override get label(): string {
        return `${this.ghostName} (live)`;
    }

    /** The tick the rider retired the current attempt at, if they did. */
    public override get lastTick(): number | null {
        return this.current?.retiredAt ?? null;
    }

    /** Ticks received but not replayed yet. */
    public get lag(): number {
        const current = this.current ? this.current.until - this.time : 0;
        return this.queue.reduce((lag, attempt) => lag + attempt.until - attempt.start, current);
    }

    /** Adds the events received from the rider, in their order. */
    public receive(events: readonly RunEvent[]): void {
        for (const event of events) {
            if (event.type === 'start') {
                this.queue.push({
                    checkpoints: event.checkpoints,
                    bike: BIKE_MAP.get(event.bike) ?? DEFAULT_BIKE,
                    start: event.time,
                    keys: new Map(CONTROL_NAMES.map((name) => [name, new Set<number>()])),
                    until: event.time,
                    retiredAt: null,
                });
                continue;
            }

            // The events after a start are those of its attempt
            const attempt = this.queue[this.queue.length - 1] ?? this.current;
            if (!attempt) {
                continue;
            }
            if (event.type === 'toggle') {
                attempt.keys.get(event.control)?.add(event.time);
            } else if (event.type === 'retire') {
                // Replayed one tick further, where the rider retires
                attempt.retiredAt = event.time;
                attempt.until = Math.max(attempt.until, event.time + 1);
            } else {
                attempt.until = Math.max(attempt.until, event.time);
            }
        }
    }

    /**
     * Runs the ticks of the run received in time for this physics tick: one, more while catching
     * up, none while waiting for inputs.
     */
    public advance(): void {
        this.moved = false;
        this.beginNextAttempts();

        const lag = this.lag;
        if (lag === 0) {
            this.buffering = true;
            return;
        }
        if (this.buffering && lag < REMOTE_BUFFER_TICKS) {
            return;
        }
        this.buffering = false;

        const steps =
            lag > REMOTE_MAX_LAG ? Math.min(lag - REMOTE_MAX_LAG + 1, REMOTE_MAX_STEPS) : 1;
        for (let i = 0; i < steps; i++) {
            this.beginNextAttempts();
            const current = this.current;
            if (!current || this.time >= current.until) {
                break;
            }
            this.fixedUpdate();
            this.track.onRemoteTick?.(this);
            this.moved = true;
        }
    }

    /** Interpolates between the last two ticks run, or shows the last one while waiting. */
    public override update(progress: number, delta: number): void {
        super.update(this.moved ? progress : 1, delta);
    }

    /** Saves a checkpoint on the next tick, as the player does when the rider reaches one. */
    protected override onHitCheckpoint(): void {
        this.mustSave = true;
    }

    protected override onHitTarget(): void {
        if (this.finishedAt === null && this.targetsReached.size >= this.track.targets.size) {
            this.finishedAt = this.time;
        }
    }

    /** Begins the attempts received once the current one is replayed to its end. */
    private beginNextAttempts(): void {
        while (this.queue.length && (!this.current || this.time >= this.current.until)) {
            this.begin(this.queue.shift()!);
        }
    }

    private begin(attempt: Attempt): void {
        // A new bike: its checkpoints are no longer valid
        if (attempt.bike !== this.bikeClass || !this.initialBike) {
            this.bikeClass = attempt.bike;
            this.createBike();
            this.snapshots = [];
        }

        // The checkpoints dropped by the rider: cancelled, or a new start
        if (this.snapshots.length < attempt.checkpoints) {
            this.desynced = true;
        }
        this.snapshots.splice(attempt.checkpoints);
        this.startFrom(this.snapshots[attempt.checkpoints - 1]);
        if (this.time !== attempt.start) {
            this.desynced = true;
        }

        this.keys = attempt.keys;
        this.current = attempt;
        this.finishedAt = null;
    }
}
