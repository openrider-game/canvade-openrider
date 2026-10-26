import { Obstacle } from '../obstacle';

/** A long climb, never steeper than about 30 degrees, then a crest. */
export const climb: Obstacle = {
    name: 'climb',
    weight: (d) => 0.7,
    draw: (pen, { d, ease, random }) => {
        const length = random.range(250, 400);
        const height = Math.min(length * 0.55, (60 + 100 * d) * random.range(0.8, 1.2));
        pen.curve(length, -height, ease);
        pen.lineTo(pen.x + 80, pen.y);
    },
};
