import type { AttemptStart, PlayerRunner, RunListener } from '../bike/runner/player-runner';
import type { ControlName } from '../bike/runner/runner-controls';
import type { RunEvent } from './run-events';
import { RunLog } from './run-log';

/**
 * Follows the run of the player to tell the other riders of a live session about it, as
 * {@link RunEvent}s: {@link RunReporter.flush} gives the events since its last call, to send as
 * the run goes on, and {@link RunReporter.resync} the whole run, for a rider joining the session
 * (see {@link RunLog}).
 */
export class RunReporter implements RunListener {
    /** Events since the last flush. */
    private pending: RunEvent[] = [];
    /** The run, as replayed by {@link RunReporter.resync}. */
    private readonly log = new RunLog();

    /** Follows the player from now on, its run so far read from the key log of its bike. */
    public constructor(private readonly runner: PlayerRunner) {
        const toggles: RunEvent[] = [];
        runner.instance?.keyLog.forEach((times, control) => {
            times.forEach((time) => toggles.push({ type: 'toggle', time, control }));
        });
        this.log.apply([
            { type: 'start', time: 0, checkpoints: 0, bike: runner.bikeClass.bikeName },
            ...toggles,
        ]);
        runner.runListener = this;
    }

    /** Stops following the player. */
    public detach(): void {
        if (this.runner.runListener === this) {
            this.runner.runListener = null;
        }
    }

    public toggled(time: number, control: ControlName): void {
        this.record({ type: 'toggle', time, control });
    }

    public started({ endedAt, time, checkpoints, bike }: AttemptStart): void {
        this.record({ type: 'progress', time: endedAt });
        this.record({ type: 'start', time, checkpoints, bike });
    }

    /** Events since the last call, up to the time the player reached. */
    public flush(): RunEvent[] {
        const events = this.pending;
        this.pending = [];
        events.push({ type: 'progress', time: this.runner.time });
        return events;
    }

    /** The whole run, from its start up to the time the player reached. */
    public resync(): RunEvent[] {
        return this.log.resync(this.runner.time);
    }

    private record(event: RunEvent): void {
        this.log.apply([event]);
        this.pending.push(event);
    }
}
