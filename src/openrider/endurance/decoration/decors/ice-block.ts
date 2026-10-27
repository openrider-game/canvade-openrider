import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A block of ice, an uneven rectangle with a line of light. */
export class IceBlock extends Decor {
    public readonly name: string = 'iceBlock';
    public readonly halfWidth: number = 26;
    public readonly height: number = 38;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const width = random.range(28, 50);
        const height = random.range(18, 34);
        const left = x - width / 2;
        const tilt = random.range(-3, 3);
        return [
            [
                [left, y],
                [left + tilt, y - height],
                [left + width + tilt, y - height + random.range(-3, 3)],
                [left + width, y],
            ],
            [
                [left + width * 0.25, y - height * 0.7],
                [left + width * 0.45, y - height * 0.3],
            ],
        ];
    }
}
