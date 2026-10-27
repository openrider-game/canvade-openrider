import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { blob } from '../outlines';

/** A tumbleweed: a ball of crossing twigs. */
export class Tumbleweed extends Decor {
    public readonly name: string = 'tumbleweed';
    public readonly halfWidth: number = 13;
    public readonly height: number = 30;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const radius = random.range(8, 13);
        // Resting on the ground, its jittered outline included
        const cy = y - radius * 1.1;
        return [
            blob(x, cy, radius, radius, random, 10, 0.1),
            [
                [x - radius * 0.7, cy - radius * 0.3],
                [x + radius * 0.6, cy + radius * 0.5],
            ],
            [
                [x - radius * 0.5, cy + radius * 0.6],
                [x + radius * 0.4, cy - radius * 0.7],
            ],
        ];
    }
}
