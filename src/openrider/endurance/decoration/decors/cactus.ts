import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A saguaro cactus: its trunk, and one or two arms going up. */
export class Cactus extends Decor {
    public readonly name: string = 'cactus';
    public readonly halfWidth: number = 20;
    public readonly height: number = 95;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const height = random.range(50, 90);
        const shapes: Point[][] = [
            [
                [x, y],
                [x, y - height],
            ],
        ];
        for (const side of random.chance(0.5) ? [-1, 1] : [random.chance(0.5) ? -1 : 1]) {
            const armY = y - height * random.range(0.35, 0.6);
            const reach = side * height * random.range(0.18, 0.26);
            shapes.push([
                [x, armY],
                [x + reach, armY],
                [x + reach, armY - height * random.range(0.2, 0.35)],
            ]);
        }
        return shapes;
    }
}
