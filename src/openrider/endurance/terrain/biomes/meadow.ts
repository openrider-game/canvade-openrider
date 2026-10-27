import { Biome } from '../biome';

/**
 * Gentle rolling hills and small kickers, with few zones: the start of every track, and a breath
 * between the harder biomes.
 */
export const meadow: Biome = {
    name: 'Meadow',
    weight: (d) => Math.max(0.4, 1.2 - d),
    length: [5, 10],
    obstacles: {
        flat: 1.5,
        rolling: 2,
        valley: 1.5,
        kicker: 1.5,
        drop: 0.4,
        stairs: 0.4,
        islands: 0.4,
        launchGap: 0.4,
        bumps: 0.5,
        tunnel: 0.2,
        ceiling: 0.2,
    },
    zones: {},
    zoneShare: 0.5,
    options: { gapScale: 1, harshness: 0.85 },
};
