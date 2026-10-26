import { from, DEFAULT_OPTIONS } from '../obstacle';
import { drop } from '../obstacles/drop';
import { flat } from '../obstacles/flat';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** No steering, over gentle ground and drops. */
export const noSteer = obstacleZone({
    name: 'noSteer',
    effect: 'noSteer',
    weight: (d) => from(d, 0.5, 0.6),
    obstacles: [rolling, flat, drop],
    options: DEFAULT_OPTIONS,
});
