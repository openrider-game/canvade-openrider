import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { mound } from '../outlines';

/** A boulder, a large rock with a crack. */
export class Boulder extends Decor {
    public readonly name: string = 'boulder';
    public readonly halfWidth: number = 35;
    public readonly height: number = 62;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const width = random.range(45, 70);
        const height = width * random.range(0.55, 0.75);
        const crackX = x + random.range(-width / 6, width / 6);
        return [
            mound(x, y, width, height, random, 9),
            [
                [crackX, y - height * 0.85],
                [crackX + 5, y - height * 0.55],
                [crackX - 2, y - height * 0.3],
            ],
        ];
    }
}
