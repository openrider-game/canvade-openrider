import { from, Obstacle } from '../obstacle';

/** A lip, a steep slope down, and a flat landing. */
export const drop: Obstacle = {
    name: 'drop',
    weight: (d) => from(d, 0.1, 1.1 * d),
    draw: (pen, { d, x, y, random, harshness }) => {
        const height = (40 + 120 * d) * random.range(0.8, 1.2) * harshness;
        pen.lineTo(x + 60, y);
        pen.lineTo(pen.x + Math.max(20, height * 0.4), pen.y + height);
        pen.lineTo(pen.x + 220, pen.y);
    },
};
