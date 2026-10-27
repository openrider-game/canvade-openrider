import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { mound } from '../outlines';

/** A round bush. */
export class Bush extends Decor {
    public readonly name: string = 'bush';
    public readonly halfWidth: number = 22;
    public readonly height: number = 28;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        return [mound(x, y, random.range(28, 44), random.range(16, 24), random, 9)];
    }
}
