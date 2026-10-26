import { Obstacle } from '../obstacle';

/** A long descent gaining speed, then a run-out. */
export const downhill: Obstacle = {
    name: 'downhill',
    weight: (d) => 0.8,
    draw: (pen, { t, ease, random }) => {
        pen.curve(random.range(450, 700), random.range(60, 140) + 120 * t, ease);
        pen.lineTo(pen.x + 120, pen.y);
    },
};
