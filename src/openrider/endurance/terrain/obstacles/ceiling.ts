import { from, Obstacle } from '../obstacle';

/** Bombs over a flat ground, lower and lower: no jumping there. */
export const ceiling: Obstacle = {
    name: 'ceiling',
    weight: (d) => from(d, 0.45, 0.3 + 1.1 * (d - 0.45)),
    draw: (pen, { d, x, y }) => {
        const height = 100 - 10 * Math.min(1, (d - 0.45) * 2);
        pen.lineTo(x + 100, y);
        for (let bomb = 0; bomb < 4; bomb++) {
            pen.addItem('bomb', pen.x + 30 + 60 * bomb, y - height);
        }
        pen.lineTo(pen.x + 260, y);
    },
};
