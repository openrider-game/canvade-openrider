import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { blob } from '../outlines';

/** A flower: a stem, and a round head. */
export class Flower extends Decor {
    public readonly name: string = 'flower';
    public readonly halfWidth: number = 5;
    public readonly height: number = 30;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const height = random.range(14, 22);
        const bend = random.range(-4, 4);
        return [
            [
                [x, y],
                [x + bend, y - height],
            ],
            blob(x + bend, y - height - 3.5, 3.5, 3.5, random, 6, 0),
        ];
    }
}
