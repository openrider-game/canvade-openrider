import { from, DEFAULT_OPTIONS } from '../obstacle';
import { bumps } from '../obstacles/bumps';
import { climb } from '../obstacles/climb';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** A heavy bike, over climbs and bumps. */
export const heavy = obstacleZone({
    name: 'heavy',
    effect: 'heavy',
    weight: (d) => from(d, 0.35, 0.8),
    obstacles: [climb, rolling, bumps],
    options: DEFAULT_OPTIONS,
});
