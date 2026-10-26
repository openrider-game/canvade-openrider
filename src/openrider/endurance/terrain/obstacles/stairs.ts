import { from, Obstacle } from '../obstacle';

/** Steps down, shaking the bike on each edge. */
export const stairs: Obstacle = {
    name: 'stairs',
    weight: (d) => from(d, 0.15, 0.8),
    draw: (pen, { t, random, harshness }) => {
        for (let step = random.int(3, 6); step > 0; step--) {
            pen.lineTo(pen.x + random.range(50, 90), pen.y);
            pen.lineTo(pen.x + 8, pen.y + (12 + 18 * t) * random.range(0.8, 1.2) * harshness);
        }
        pen.lineTo(pen.x + 120, pen.y);
    },
};
