import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { mound } from '../outlines';

/** A rock lying on the ground. */
export class Rock extends Decor {
    public readonly name: string = 'rock';
    public readonly halfWidth: number = 18;
    public readonly height: number = 26;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        return [mound(x, y, random.range(18, 36), random.range(10, 22), random)];
    }
}
