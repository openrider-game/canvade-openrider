import { from, Obstacle } from '../obstacle';

/** A steep climb, with boosts along it pushing the bike up. */
export const boostClimb: Obstacle = {
    name: 'boostClimb',
    weight: (d) => from(d, 0.1, 0.6),
    draw: (pen, { x, y, random }) => {
        const length = random.range(200, 300);
        const height = length * random.range(0.6, 0.85);
        const angle = (Math.atan2(height, length) * 180) / Math.PI;
        const boosts = Math.floor(length / 60);
        for (let boost = 1; boost <= boosts; boost++) {
            const k = boost / (boosts + 1);
            pen.addItem('boost', x + length * k, y - height * k - 12, 270 - angle);
        }
        pen.lineTo(x + length, y - height);
        pen.lineTo(pen.x + 100, pen.y);
    },
};
