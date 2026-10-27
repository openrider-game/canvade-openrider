import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A pine: its trunk, then three stacked triangles, smaller and smaller. */
export class Pine extends Decor {
    public readonly name: string = 'pine';
    public readonly halfWidth: number = 20;
    public readonly height: number = 136;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const height = random.range(70, 130);
        const width = height * random.range(0.28, 0.36);
        const trunk = height * 0.18;
        const shapes: Point[][] = [
            [
                [x, y],
                [x, y - trunk],
            ],
        ];
        for (let tier = 0; tier < 3; tier++) {
            const base = y - trunk - tier * height * 0.24;
            const half = width * (1 - tier * 0.25);
            shapes.push([
                [x - half, base],
                [x, base - height * 0.38],
                [x + half, base],
                [x - half, base],
            ]);
        }
        return shapes;
    }
}
