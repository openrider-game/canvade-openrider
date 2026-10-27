import { from } from '../obstacle';
import { Biome } from '../biome';

/** Tunnels and low ceilings over bumpy ground, with zero gravity and shields. */
export const caves: Biome = {
    name: 'Caves',
    weight: (d) => from(d, 0.4, 0.8),
    length: [5, 10],
    obstacles: {
        tunnel: 3,
        ceiling: 2.5,
        bumps: 1.5,
        stairs: 1.2,
        jump: 0.5,
        launchGap: 0.5,
        kicker: 0.5,
    },
    zones: { space: 2, shield: 1.5, noSteer: 1.2 },
    zoneShare: 1,
    options: { gapScale: 1, harshness: 1 },
};
