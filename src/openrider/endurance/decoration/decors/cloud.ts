import type { SeededRandom } from '../../seeded-random';
import type { Point } from '../../terrain.types';
import { Decor } from '../decor';
import { blob } from '../outlines';

/** A cloud high in the sky over the ground: a long ellipse with two smaller ones on top. */
export class Cloud extends Decor {
    public readonly name: string = 'cloud';
    public override readonly placement = 'sky';
    public readonly halfWidth: number = 0;
    public readonly height: number = 0;

    public draw(x: number, y: number, random: SeededRandom): Point[][] {
        const width = random.range(70, 110);
        const skyY = y - random.range(260, 380);
        return [
            blob(x, skyY, width / 2, width / 7, random, 14, 0.05),
            blob(x - width * 0.15, skyY - width / 8, width / 5, width / 7, random, 10, 0.05),
            blob(x + width * 0.12, skyY - width / 9, width / 6, width / 8, random, 10, 0.05),
        ];
    }
}
