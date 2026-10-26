import { from } from '../obstacle';
import { Zone } from '../zone';

/** Zero gravity: floating straight over a gap to a platform at the same height. */
export const space: Zone = {
    name: 'space',
    effect: 'zeroGravity',
    weight: (d) => from(d, 0.4, 0.6),
    drawInside: (pen, d, random) => {
        const gap = random.range(220, 360) + 120 * Math.min(1, d);
        pen.lineTo(pen.x + 120, pen.y);
        pen.gapTo(pen.x + gap, pen.y);
        pen.lineTo(pen.x + 160, pen.y);
    },
};
