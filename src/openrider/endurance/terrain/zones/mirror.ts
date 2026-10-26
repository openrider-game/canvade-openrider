import { from, DEFAULT_OPTIONS } from '../obstacle';
import { bumps } from '../obstacles/bumps';
import { kicker } from '../obstacles/kicker';
import { rolling } from '../obstacles/rolling';
import { obstacleZone } from '../zone';

/** Mirrored leaning, over hills, bumps and kickers. */
export const mirror = obstacleZone({
    name: 'mirror',
    effect: 'mirror',
    weight: (d) => from(d, 0.55, 0.7),
    obstacles: [rolling, bumps, kicker],
    options: DEFAULT_OPTIONS,
});
