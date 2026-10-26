import type { GroundPen } from '../ground-pen';
import type { SeededRandom } from '../seeded-random';

/** Options of the obstacles drawn in a zone. */
export interface ObstacleOptions {
    /** Factor of the width of the gaps, larger under low gravity or turbo. */
    gapScale: number;
    /** Factor of the size of the bumps and drops, larger under invincibility. */
    harshness: number;
}

export const DEFAULT_OPTIONS: ObstacleOptions = { gapScale: 1, harshness: 1 };

/** What an obstacle is drawn from, shared by all the obstacles. */
export interface ObstacleContext extends ObstacleOptions {
    /** Difficulty, from 0. */
    d: number;
    /** Difficulty capped at 1, for the sizes that stop growing. */
    t: number;
    /** Smooth step from 0 to 1. */
    ease: (k: number) => number;
    /** Position of the pen at the start of the obstacle. */
    x: number;
    y: number;
    random: SeededRandom;
}

/**
 * Obstacle of the terrain, one per file of `obstacles/`, picked at random among the obstacles of
 * a version of the generator (see `versions.ts`).
 *
 * An obstacle released in a version never changes: the tracks of that version, and the runs
 * ridden on them, depend on it. A changed obstacle is a new one, under a new name, in a new
 * version.
 */
export interface Obstacle {
    /** Name of the obstacle, unique in a version, shown by the debug overlay. */
    readonly name: string;
    /** How often the obstacle comes at a difficulty, 0 for never, e.g. the hardest at first. */
    weight(d: number): number;
    /** Draws the obstacle from the position of the pen, its size growing with the difficulty. */
    draw(pen: GroundPen, context: ObstacleContext): void;
}

/** A weight from a difficulty on, 0 before it. */
export function from(d: number, start: number, weight: number): number {
    return d >= start ? weight : 0;
}

/** Draws an obstacle from the position of the pen, in a zone with its options. */
export function drawObstacle(
    pen: GroundPen,
    obstacle: Obstacle,
    d: number,
    random: SeededRandom,
    { gapScale, harshness }: ObstacleOptions,
): void {
    // The sizes stop growing at difficulty 1, except the ones making the track impossible
    const t = Math.min(1, d);
    const ease = (k: number) => (1 - Math.cos(Math.PI * k)) / 2;
    const { x, y } = pen;

    obstacle.draw(pen, { d, t, ease, x, y, random, gapScale, harshness });
}
