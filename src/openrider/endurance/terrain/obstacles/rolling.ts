import { Obstacle } from '../obstacle';

/** Hills and dips, higher and shorter as the difficulty grows. */
export const rolling: Obstacle = {
    name: 'rolling',
    weight: (d) => 1.6,
    draw: (pen, { d, t, random }) => {
        for (let wave = random.int(2, 4); wave > 0; wave--) {
            const length = random.range(260, 420) * (1 - 0.35 * t);
            const height = (15 + 40 * d) * random.range(0.7, 1.3);
            const direction = random.chance(0.5) ? -1 : 1;
            pen.curve(length, direction * height, (k) => (1 - Math.cos(2 * Math.PI * k)) / 2);
        }
    },
};
