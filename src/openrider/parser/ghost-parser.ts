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
}

/**
 * Reads and writes ghost strings.
 *
 * Ghost strings are formatted as `up,down,left,right,turn,time,bike,name`, where each key part
 * lists the track times (in physics ticks, base 10) at which its control toggled, separated
 * with spaces. The name is optional: generated strings stop at the bike.
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
        };
    }

    /**
     * Generates the ghost string of the current run, from the key log of the bike.
     *
     * @param time - Time of the run, in physics ticks: the current track time by default.
     */
    public static generate(bikeRunner: BikeRunner, time = bikeRunner.track.time): string {
        const ghostKeys: Array<string | number> = [];

        bikeRunner.instance?.keyLog.forEach((times) => {
            ghostKeys.push(times.join(' '));
        });

        ghostKeys.push(time, bikeRunner.bikeClass.bikeName);

        return ghostKeys.join(',');
    }
}
