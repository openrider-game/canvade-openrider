import type { LiveResult } from '../../src/openrider/live/protocol';
import { broadcast, type Session } from './live-session';
import type { Verdict } from './verifier';

/**
 * Best run of a rider: its time in ticks, and its distance in whole meters in endurance, and
 * whether the rider retired it there.
 */
export interface BestRun {
    time: number;
    distance: number | null;
    retired: boolean;
}

/** A run the verifier accepted, at its time: its distance in whole meters in endurance. */
export function verifiedRun(time: number, verdict: Verdict): BestRun {
    return {
        time,
        distance: verdict.distance === undefined ? null : Math.floor(verdict.distance),
        retired: verdict.retired === true,
    };
}

/** Whether a run beats another: further in whole meters, else as far and faster. */
export function beats(run: BestRun, best: BestRun | null): boolean {
    if (best === null) {
        return true;
    }
    const further = (run.distance ?? 0) - (best.distance ?? 0);
    return further > 0 || (further === 0 && run.time < best.time);
}

/** Riders of a session, best run first (see {@link beats}), then those without, by name. */
export function sessionResults(session: Session): LiveResult[] {
    return [...session.riders.values()]
        .filter((rider) => rider.socket || rider.best !== null)
        .sort((a, b) => {
            if (a.best && b.best && beats(a.best, b.best) !== beats(b.best, a.best)) {
                return beats(a.best, b.best) ? -1 : 1;
            }
            if (Boolean(a.best) !== Boolean(b.best)) {
                return a.best ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        })
        .map(({ id, name, best, socket }) => ({
            id,
            name,
            best: best?.time ?? null,
            distance: best?.distance ?? null,
            retired: best?.retired ?? false,
            riding: socket !== null,
        }));
}

/** Sends the results of a session to its riders. */
export function broadcastResults(session: Session): void {
    broadcast(session, { type: 'results', results: sessionResults(session) });
}
