import { from, Obstacle } from '../obstacle';

/** Mud slowing the bike down before a rise, to cross with speed. */
export const mudPit: Obstacle = {
    name: 'mudPit',
    weight: (d) => from(d, 0.15, 0.6),
    draw: (pen, { t, ease, x, y, random }) => {
        pen.lineTo(x + 40, y);
        const length = random.range(150, 250);
        for (let mud = 0; mud * 30 < length; mud++) {
            pen.addItem('mud', pen.x + 15 + 30 * mud, y - 8);
        }
        pen.lineTo(pen.x + length, y);
        pen.curve(160, -(30 + 30 * t), ease);
        pen.lineTo(pen.x + 80, pen.y);
    },
};
