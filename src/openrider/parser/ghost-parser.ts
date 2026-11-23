import { BIKE_MAP, DEFAULT_BIKE } from '../bike/bike.constants';
import { BikeClass } from '../bike/bike';
import type { BikeRunner } from '../bike/runner/bike-runner';
import { CONTROL_NAMES, ControlName } from '../bike/runner/runner-controls';

/** Content of a ghost string. */
export interface GhostData {
    /** Track times (in physics ticks) at which each control toggled. */
    keys: Map<ControlName, Set<number>>;
    /** Time of the run, in physics ticks. */
    time: number;
    bike: BikeClass;
    name: string;
    /**
     * Times of the run the game paused at, in physics ticks, see `Bike.pauseLog`; empty when
     * none, or for a ghost recorded before the pauses were.
     */
    pauses: number[];
}

/**
 * Reads and writes ghost strings.
 *
 * Ghost strings are formatted as `up,down,left,right,turn,time,bike,name,pauses`, where each key
 * part lists the track times (in physics ticks, base 10) at which its control toggled, separated
 * with spaces, and `pauses` the times the game paused at, the same way. The name is optional:
 * generated strings leave it empty, the website writing it. The pauses too: a run without any
 * stops at the bike, as the strings recorded before the pauses were, which every version reads.
 */
export abstract class GhostParser {
    /** Parses a ghost string, falling back to the default bike and to `Ghost` as name. */
    public static parse(ghostString: string): GhostData {
        const parts = ghostString.split(',');

        const keys = new Map<ControlName, Set<number>>();
        for (const name of CONTROL_NAMES) {
            const times = (parts.shift() ?? '').split(' ').filter((time) => time !== '');
            keys.set(name, new Set(times.map(Number)));
        }

        return {
            keys,
            time: Number(parts[0]) || 0,
            bike: BIKE_MAP.get(parts[1]) ?? DEFAULT_BIKE,
            name: parts[2] || 'Ghost',
            pauses: (parts[3] ?? '')
                .split(' ')
                .filter((time) => time !== '')
                .map(Number)
                .filter((time) => Number.isInteger(time) && time >= 0),
        };
    }

    /**
     * Generates the ghost string of the current run, from the key log of the bike.
     *
     * @param time - Time of the run, in physics ticks: the current track time by default.
     */
    public static generate(bikeRunner: BikeRunner, time = bikeRunner.time): string {
        const ghostKeys: Array<string | number> = [];

        bikeRunner.instance?.keyLog.forEach((times) => {
            ghostKeys.push(times.join(' '));
        });

        ghostKeys.push(time, bikeRunner.bikeClass.bikeName);
        // The pauses after an empty name, only when the run has some
        const pauses = bikeRunner.instance?.pauseLog ?? [];
        if (pauses.length) {
            ghostKeys.push('', pauses.join(' '));
        }

        return ghostKeys.join(',');
    }
}
