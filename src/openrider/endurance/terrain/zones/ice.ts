import { from, DEFAULT_OPTIONS } from '../obstacle';
import { downhill } from '../obstacles/downhill';
import { flat } from '../obstacles/flat';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** Slippery wheels: gentle ground, hard to climb. */
export const ice = obstacleZone({
    name: 'ice',
    effect: 'slippery',
    weight: (d) => from(d, 0.3, 0.8),
    obstacles: [rolling, downhill, flat],
    options: DEFAULT_OPTIONS,
});
