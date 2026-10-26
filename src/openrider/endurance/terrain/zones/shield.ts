import { from } from '../obstacle';
import { bumps } from '../obstacles/bumps';
import { ceiling } from '../obstacles/ceiling';
import { drop } from '../obstacles/drop';
import { stairs } from '../obstacles/stairs';
import { obstacleZone } from '../zone';

/** Invincible: much harsher bumps and drops, bombs included. */
export const shield = obstacleZone({
    name: 'shield',
    effect: 'invincibility',
    weight: (d) => from(d, 0.4, 0.5),
    obstacles: [bumps, drop, stairs, ceiling],
    options: { gapScale: 1, harshness: 2 },
});
