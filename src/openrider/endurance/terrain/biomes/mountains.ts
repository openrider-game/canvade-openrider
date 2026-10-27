import { Biome } from '../biome';

/** Long climbs and descents, drops and stairs, with low gravity on the peaks. */
export const mountains: Biome = {
    name: 'Mountains',
    weight: () => 1,
    length: [5, 10],
    obstacles: {
        climb: 2.5,
        downhill: 2.5,
        drop: 1.8,
        stairs: 1.5,
        boostClimb: 2,
        slowDrop: 1.5,
        rolling: 0.6,
        flat: 0.4,
        islands: 0.6,
    },
    zones: { moon: 2.5, heavy: 1.5 },
    zoneShare: 1,
    options: { gapScale: 1, harshness: 1.15 },
};
