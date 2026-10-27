import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A stalactite: a spike hanging from the ceiling at y. */
export class Stalactite extends Decor {
    public readonly name: string = 'stalactite';
    public override readonly placement = 'ceiling';
    public readonly halfWidth: number = 10;
    public readonly height: number = 45;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const length = random.range(15, 45);
        const half = length * random.range(0.15, 0.25);
        return [
            [
                [x - half, y],
                [x + random.range(-2, 2), y + length],
                [x + half, y],
            ],
        ];
    }
}
