import { from, Obstacle } from '../obstacle';

/** A slow motion before a big drop, to land it carefully. */
export const slowDrop: Obstacle = {
    name: 'slowDrop',
    weight: (d) => from(d, 0.2, 0.5),
    draw: (pen, { t, x, y, random }) => {
        const height = (100 + 100 * t) * random.range(0.8, 1.2);
        pen.lineTo(x + 80, y);
        pen.addItem('slowMo', pen.x - 20, y - 20);
        pen.lineTo(pen.x + Math.max(30, height * 0.45), pen.y + height);
        pen.lineTo(pen.x + 220, pen.y);
    },
};
