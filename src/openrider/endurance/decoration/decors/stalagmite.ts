import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A stalagmite: a spike growing up from the ground. */
export class Stalagmite extends Decor {
    public readonly name: string = 'stalagmite';
    public readonly halfWidth: number = 12;
    public readonly height: number = 48;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const height = random.range(20, 45);
        const half = height * random.range(0.18, 0.28);
        return [
            [
                [x - half, y],
                [x + random.range(-3, 3), y - height],
                [x + half, y],
            ],
        ];
    }
}
