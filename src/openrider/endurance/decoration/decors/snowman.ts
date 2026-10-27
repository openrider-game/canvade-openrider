import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { blob } from '../outlines';

/** A snowman: two balls of snow, eyes and a nose. */
export class Snowman extends Decor {
    public readonly name: string = 'snowman';
    public readonly halfWidth: number = 14;
    public readonly height: number = 50;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const body = random.range(11, 14);
        const head = body * 0.65;
        const headY = y - 2 * body - head + 2;
        return [
            // Resting on the ground, its jittered outline included
            blob(x, y - body * 1.03, body, body, random, 12, 0.03),
            blob(x, headY, head, head, random, 10, 0.03),
            [
                [x - head * 0.35, headY - head * 0.25],
                [x - head * 0.3, headY - head * 0.2],
            ],
            [
                [x + head * 0.3, headY - head * 0.25],
                [x + head * 0.35, headY - head * 0.2],
            ],
            [
                [x, headY + head * 0.1],
                [x + head * 0.9, headY + head * 0.2],
            ],
        ];
    }
}
