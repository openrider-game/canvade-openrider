import { Obstacle } from '../obstacle';

/** Flat ground, of a random length. */
export const flat: Obstacle = {
    name: 'flat',
    weight: (d) => Math.max(0.5, 2.2 - 1.5 * d),
    draw: (pen, { x, y, random }) => {
        pen.lineTo(x + random.range(120, 260), y);
    },
};
