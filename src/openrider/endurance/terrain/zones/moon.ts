import { from } from '../obstacle';
import { jump } from '../obstacles/jump';
import { kicker } from '../obstacles/kicker';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** Low gravity: further jumps over wider gaps. */
export const moon = obstacleZone({
    name: 'moon',
    effect: 'lowGravity',
    weight: (d) => from(d, 0.2, 1),
    obstacles: [jump, kicker, rolling],
    options: { gapScale: 1.2, harshness: 1 },
});
