import { from, Obstacle } from '../obstacle';

/** A launcher on the run-up throwing the bike over a wide gap. */
export const launchGap: Obstacle = {
    name: 'launchGap',
    weight: (d) => from(d, 0.3, 0.4 + 0.6 * d),
    draw: (pen, { t, x, y, random, gapScale }) => {
        pen.lineTo(x + 160, y);
        pen.addItem('launcher', x + 110, y - 10, 235);
        const gap = (180 + 140 * t) * random.range(0.85, 1.15) * gapScale;
        pen.gapTo(pen.x + gap, pen.y + 40);
        pen.curve(220, 70, (k) => k * (2 - k));
        pen.lineTo(pen.x + 120, pen.y);
    },
};
