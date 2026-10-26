import { from } from '../obstacle';
import { Zone } from '../zone';

/** Engine off down a long slope, the momentum carrying the bike over a rise. */
export const coast: Zone = {
    name: 'coast',
    effect: 'engineOff',
    weight: (d) => from(d, 0.3, 0.7),
    drawInside: (pen, _d, random) => {
        const drop = random.range(120, 200);
        pen.curve(random.range(380, 480), drop, (k) => (1 - Math.cos(Math.PI * k)) / 2);
        pen.lineTo(pen.x + 120, pen.y);
        pen.curve(160, -drop * 0.3, (k) => (1 - Math.cos(Math.PI * k)) / 2);
        pen.lineTo(pen.x + 60, pen.y);
    },
};
