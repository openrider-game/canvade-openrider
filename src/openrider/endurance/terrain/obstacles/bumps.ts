import { from, Obstacle } from '../obstacle';

/** Sharp bumps, shaking the bike more and more. */
export const bumps: Obstacle = {
    name: 'bumps',
    weight: (d) => from(d, 0.25, 1.3 * d),
    draw: (pen, { d, y, random, harshness }) => {
        for (let bump = random.int(3, 6); bump > 0; bump--) {
            const width = random.range(40, 70);
            const height = (6 + 16 * d) * random.range(0.8, 1.2) * harshness;
            pen.lineTo(pen.x + width / 2, y - height);
            pen.lineTo(pen.x + width / 2, y);
            pen.lineTo(pen.x + random.range(20, 60), y);
        }
    },
};
