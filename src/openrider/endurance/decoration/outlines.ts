import type { SeededRandom } from '../seeded-random';
import type { Point } from '../terrain.types';

/** Outlines shared by the decors (see `decors/`), in world units, y pointing down. */

/** Closed polygon of an ellipse, its radii jittered by up to `jitter` of themselves. */
export function blob(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    random: SeededRandom,
    count = 12,
    jitter = 0.15,
): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        const scale = 1 + random.range(-jitter, jitter);
        points.push([cx + Math.cos(angle) * rx * scale, cy + Math.sin(angle) * ry * scale]);
    }
    return [...points, points[0]];
}

/** Upper half of an ellipse standing on the ground at `x`, `y`, jittered: a rock or a bush. */
export function mound(
    x: number,
    y: number,
    width: number,
    height: number,
    random: SeededRandom,
    count = 7,
): Point[] {
    const points: Point[] = [];
    for (let i = 0; i <= count; i++) {
        const angle = Math.PI - (Math.PI * i) / count;
        const scale = i === 0 || i === count ? 1 : 1 + random.range(-0.2, 0.15);
        points.push([x + (Math.cos(angle) * width) / 2, y - Math.sin(angle) * height * scale]);
    }
    return points;
}
