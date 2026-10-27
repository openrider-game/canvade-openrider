import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A wooden fence: a few posts and two rails. */
export class Fence extends Decor {
    public readonly name: string = 'fence';
    public readonly halfWidth: number = 40;
    public readonly height: number = 24;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const posts = random.int(3, 4);
        const spacing = 22;
        const start = x - ((posts - 1) * spacing) / 2;
        const end = start + (posts - 1) * spacing;
        const shapes = Array.from({ length: posts }, (_, i): Point[] => [
            [start + i * spacing, y],
            [start + i * spacing, y - 22],
        ]);
        shapes.push(
            [
                [start, y - 18],
                [end, y - 18],
            ],
            [
                [start, y - 9],
                [end, y - 9],
            ],
        );
        return shapes;
    }
}
