import { from, Obstacle } from '../obstacle';

/** A ceiling over the ground: the head of the rider must not touch it. */
export const tunnel: Obstacle = {
    name: 'tunnel',
    weight: (d) => from(d, 0.35, 0.7),
    draw: (pen, { t, x, y, random }) => {
        const height = 130 - 15 * t;
        const length = random.range(300, 500);
        pen.lineTo(x + 60, y);
        // Funnel at the entrance, guiding the bikes coming slightly high
        pen.addCeiling([
            [pen.x - 50, pen.y - height - 60],
            [pen.x, pen.y - height],
            [pen.x + length, pen.y - height],
            [pen.x + length + 50, pen.y - height - 60],
        ]);
        const end = pen.x + length;
        while (pen.x < end - 60) {
            const width = random.range(50, 90);
            pen.lineTo(pen.x + width / 2, y - (4 + 8 * t) * random.next());
            pen.lineTo(pen.x + width / 2, y);
        }
        pen.lineTo(end + 60, y);
    },
};
