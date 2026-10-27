import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A cluster of two or three crystals, thin leaning diamonds. */
export class Crystals extends Decor {
    public readonly name: string = 'crystals';
    public readonly halfWidth: number = 14;
    public readonly height: number = 40;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        return Array.from({ length: random.int(2, 3) }, (_, i): Point[] => {
            const height = random.range(14, 28) * (i === 0 ? 1.3 : 1);
            const lean = random.range(-0.35, 0.35);
            const baseX = x + (i - 1) * 7;
            const tipX = baseX + lean * height;
            const midX = (baseX + tipX) / 2;
            const midY = y - height * 0.45;
            return [
                [baseX, y],
                [midX - 4, midY],
                [tipX, y - height],
                [midX + 4, midY],
                [baseX, y],
            ];
        });
    }
}
