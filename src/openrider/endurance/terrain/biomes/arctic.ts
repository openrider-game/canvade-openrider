import { Biome } from '../biome';

/** Long smooth downhills and valleys, slippery ice zones, and no mud. */
export const arctic: Biome = {
    name: 'Arctic',
    weight: () => 0.8,
    length: [5, 10],
    obstacles: {
        downhill: 2,
        valley: 2,
        slowDrop: 2,
        rolling: 1.3,
        mudPit: 0.1,
        bumps: 0.5,
    },
    zones: { ice: 4 },
    zoneShare: 1.3,
    options: { gapScale: 1, harshness: 1 },
};
