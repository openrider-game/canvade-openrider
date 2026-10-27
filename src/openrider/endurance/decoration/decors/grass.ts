import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';

/** A tuft of grass: a few blades fanning out. */
export class Grass extends Decor {
    public readonly name: string = 'grass';
    public readonly halfWidth: number = 8;
    public readonly height: number = 15;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const blades = random.int(3, 5);
        return Array.from({ length: blades }, (_, i): Point[] => {
            const k = i / (blades - 1) - 0.5;
            return [
                [x + k * 6, y],
                [x + k * 14 + random.range(-2, 2), y - random.range(7, 13)],
            ];
        });
    }
}
