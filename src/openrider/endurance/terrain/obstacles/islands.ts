import { from, Obstacle } from '../obstacle';

/** Platforms with gaps between them, to cross with enough speed. */
export const islands: Obstacle = {
    name: 'islands',
    weight: (d) => from(d, 0.25, 0.4 + 0.6 * d),
    draw: (pen, { t, x, y, random, gapScale }) => {
        pen.lineTo(x + 120, y);
        for (let island = random.int(2, 4); island > 0; island--) {
            const gap = (40 + 70 * t) * random.range(0.8, 1.2) * gapScale;
            pen.gapTo(pen.x + gap, pen.y + random.range(0, 25));
            pen.lineTo(pen.x + random.range(90, 150), pen.y);
        }
        pen.lineTo(pen.x + 60, pen.y);
    },
};
