import { from } from '../obstacle';
import { drop } from '../obstacles/drop';
import { jump } from '../obstacles/jump';
import { kicker } from '../obstacles/kicker';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** A faster bike, slightly wider gaps. */
export const turbo = obstacleZone({
    name: 'turbo',
    effect: 'turbo',
    weight: (d) => from(d, 0.25, 1),
    obstacles: [jump, rolling, drop, kicker],
    options: { gapScale: 1.3, harshness: 1 },
});
