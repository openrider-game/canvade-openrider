import { from, Obstacle } from '../obstacle';

/** A short steep kicker throwing the bike in the air, landing down a slope. */
export const kicker: Obstacle = {
    name: 'kicker',
    weight: (d) => from(d, 0.1, 0.8),
    draw: (pen, { t, ease, x, y }) => {
        pen.lineTo(x + 100, y);
        pen.curve(50, -(14 + 14 * t), (k) => k * k);
        pen.lineTo(pen.x + 30, pen.y);
        pen.curve(200, 60 + 30 * t, ease);
        pen.lineTo(pen.x + 100, pen.y);
    },
};
