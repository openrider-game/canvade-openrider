import { from } from '../obstacle';
import { Biome } from '../biome';

/** Gaps between rock islands, jumps and overhangs, with turbo and coasting zones. */
export const canyon: Biome = {
    name: 'Canyon',
    weight: (d) => from(d, 0.2, 1),
    length: [5, 10],
    obstacles: {
        launchGap: 2.5,
        islands: 2.5,
        jump: 2,
        ceiling: 1.5,
        kicker: 1.5,
        rolling: 0.5,
        valley: 0.5,
        mudPit: 0.3,
    },
    zones: { coast: 2, turbo: 2 },
    zoneShare: 1,
    options: { gapScale: 1.15, harshness: 1 },
};
