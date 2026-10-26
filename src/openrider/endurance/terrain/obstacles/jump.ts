import { from, Obstacle } from '../obstacle';

/**
 * A run-up, a ramp, a gap, and a landing going down along the fall of the bike. The wider gaps
 * come with a boost on the run-up, sometimes.
 */
export const jump: Obstacle = {
    name: 'jump',
    weight: (d) => from(d, 0.05, 0.6 + 1.4 * d),
    draw: (pen, { d, t, x, y, random, gapScale }) => {
        pen.lineTo(x + 160, y);
        if (d >= 0.3 && random.chance(0.25 + 0.25 * t)) {
            pen.addItem('boost', x + 70, y - 10, 270);
        }
        const rise = 12 + 26 * d;
        pen.curve(140, -rise, (k) => k * k);
        const gap = (70 + 150 * d) * random.range(0.85, 1.15) * gapScale;
        pen.gapTo(pen.x + gap, pen.y + 30 + 40 * d);
        // The landing stretches with the gap, e.g. under low gravity
        pen.curve(220 * gapScale, 60, (k) => k * (2 - k));
        pen.lineTo(pen.x + 120, pen.y);
    },
};
