import { CONTROL_NAMES, ControlName } from '../bike/runner/runner-controls';
import type { RunEvent } from './run-events';

/** Control toggled during a run. */
interface Toggle {
    time: number;
    control: ControlName;
}

/**
 * The run of a rider as told by its {@link RunEvent}s, reduced to what replays it from its start
 * without restarting: the inputs of the attempts kept by the checkpoints, then those of the
 * current attempt. Kept by the `RunReporter` of the player and by the session server for each
 * rider, to send the whole run to a rider joining the session (see {@link RunLog.resync}).
 *
 * The checkpoints save everything a run depends on, so that the replay ends in the same state as
 * the rider.
 */
export class RunLog {
    /** Name of the bike of the run, null before its first start. */
    private bike: string | null = null;
    /** Inputs of the run from its start, in the order received. */
    private toggles: Toggle[] = [];
    /** Time before which every input of the current attempt was received. */
    private until = 0;
    /** Last tick of the current attempt when the rider retired it, null otherwise. */
    private retiredAt: number | null = null;

    /** Whether the run started. */
    public get started(): boolean {
        return this.bike !== null;
    }

    /** Number of inputs kept. */
    public get size(): number {
        return this.toggles.length;
    }

    /** Follows the events of the run, the inputs before its first start being ignored. */
    public apply(events: readonly RunEvent[]): void {
        for (const event of events) {
            if (event.type === 'start') {
                // The inputs kept: those of the run up to the checkpoint started from
                this.toggles = event.checkpoints
                    ? this.toggles.filter((toggle) => toggle.time < event.time)
                    : [];
                this.bike = event.bike;
                this.until = event.time;
                this.retiredAt = null;
            } else if (this.bike === null) {
                continue;
            } else if (event.type === 'toggle') {
                this.toggles.push({ time: event.time, control: event.control });
            } else if (event.type === 'retire') {
                this.retiredAt = event.time;
            } else {
                this.until = Math.max(this.until, event.time);
            }
        }
    }

    /**
     * The whole run as events, from its start, empty before it started.
     *
     * @param until - Time the run is known up to, the last one received by default.
     */
    public resync(until = this.until): RunEvent[] {
        if (this.bike === null) {
            return [];
        }
        return [
            { type: 'start', time: 0, checkpoints: 0, bike: this.bike },
            // In the order of the ghost strings within a tick, which does not matter
            ...[...this.toggles]
                .sort(
                    (a, b) =>
                        a.time - b.time ||
                        CONTROL_NAMES.indexOf(a.control) - CONTROL_NAMES.indexOf(b.control),
                )
                .map((toggle): RunEvent => ({ type: 'toggle', ...toggle })),
            { type: 'progress', time: until },
            ...(this.retiredAt === null
                ? []
                : [{ type: 'retire', time: this.retiredAt } satisfies RunEvent]),
        ];
    }
}
