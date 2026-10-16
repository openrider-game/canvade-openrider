import { BikeClass } from './bike';
import { BMX } from './bmx';
import { MTB } from './mtb';

/** Bike used when a track or ghost code names no bike, or an unknown one. */
export const DEFAULT_BIKE: BikeClass = BMX,
    /** Bike classes by {@link BikeClass.bikeName}, as written in track codes and ghost strings. */
    BIKE_MAP = new Map<string, BikeClass>([
        [BMX.bikeName, BMX],
        [MTB.bikeName, MTB],
    ]),
    /** Next bike for the Switch Bike tool (Control+B), by name of the current bike. */
    SWITCH_MAP = new Map<string, BikeClass>([
        [BMX.bikeName, MTB],
        [MTB.bikeName, BMX],
    ]);
