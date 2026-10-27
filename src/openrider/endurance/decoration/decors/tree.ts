import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { blob } from '../outlines';

/** A leafy tree: its trunk, two branches, and a round crown. */
export class Tree extends Decor {
    public readonly name: string = 'tree';
    public readonly halfWidth: number = 15;
    public readonly height: number = 150;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const height = random.range(80, 140);
        const lean = random.range(-6, 6);
        const top: Point = [x + lean, y - height * 0.55];
        const crownY = y - height * 0.72;
        return [
            [[x, y], top],
            [
                [x + lean * 0.5, y - height * 0.4],
                [x - height * 0.15, y - height * 0.62],
            ],
            [
                [x + lean * 0.6, y - height * 0.48],
                [x + height * 0.16, y - height * 0.66],
            ],
            blob(x + lean, crownY, height * 0.32, height * 0.26, random, 14),
        ];
    }
}
