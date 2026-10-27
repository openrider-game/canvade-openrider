import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Pine } from './pine';

/** A pine under snow: a pine, a line of snow along the bottom of each tier. */
export class SnowyPine extends Pine {
    public override readonly name: string = 'snowyPine';

    public override draw(x: number, y: number, random: SeededRandom): Point[][] {
        const shapes = super.draw(x, y, random);
        const snow = shapes.slice(1).map(([left, , right]): Point[] => [
            [left[0] + 4, left[1] - 3],
            [(left[0] + right[0]) / 2, left[1] - 6],
            [right[0] - 4, right[1] - 3],
        ]);
        return [...shapes, ...snow];
    }
}
