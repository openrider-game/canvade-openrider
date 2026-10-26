import { Obstacle } from '../obstacle';

/** A wide dip, as a half-pipe, getting deeper. */
export const valley: Obstacle = {
    name: 'valley',
    weight: (d) => 0.8,
    draw: (pen, { t, random }) => {
        const depth = random.range(30, 80) + 80 * t;
        pen.curve(random.range(380, 560), depth, (k) => (1 - Math.cos(2 * Math.PI * k)) / 2);
    },
};
