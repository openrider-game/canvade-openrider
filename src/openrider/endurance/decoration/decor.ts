import type { SeededRandom } from '../seeded-random';
import type { Point } from '../terrain.types';

/**
 * Where a decor goes: standing on the ground, high in the sky over the ground, or hanging from
 * the ceilings of the tunnels.
 */
export type DecorPlacement = 'ground' | 'sky' | 'ceiling';

/**
 * Shape of the decoration of the endurance tracks, one per file of `decors/`, created by name
 * by the {@link DecorFactory} for the biomes naming it (see `biomes/`).
 *
 * A decor draws scenery polylines in world units (y pointing down) from where it goes: the
 * ground at `x`, `y` under it for the ground and the sky, the ceiling for the ceiling. Each one is
 * a few dozen segments at most, its size and details drawn from a random generator.
 */
export abstract class Decor {
    /** Name of the decor, by which the biomes name it. */
    public abstract readonly name: string;
    public readonly placement: DecorPlacement = 'ground';
    /** Half of the width of the ground the decor stands on, in world units. */
    public abstract readonly halfWidth: number;
    /** Highest the decor goes, kept clear of the ceilings, in world units. */
    public abstract readonly height: number;

    /** Draws the decor where it goes, as scenery polylines. */
    public abstract draw(x: number, y: number, random: SeededRandom): Point[][];
}
