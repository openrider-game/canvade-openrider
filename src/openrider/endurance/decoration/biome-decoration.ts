/**
 * Decoration of a biome, one per file of `biomes/`: the decors it is made of, by name (see
 * `DecorFactory`), and how close they are.
 *
 * Unlike the biomes of the terrain (see `terrain/biomes/`), it is no part of a version of the
 * generator, and can change from one release of the game to the next.
 */
export interface BiomeDecoration {
    /** Name of the biome decorated, see `Biome.name`. */
    readonly biome: string;
    /** Mean distance between two decors on the ground or in the sky, in world units. */
    readonly spacing: number;
    /** Mean distance between two decors hanging from the ceilings, in world units. */
    readonly ceilingSpacing?: number;
    /**
     * How often each decor comes, by name, among the decors of its placement: those on the
     * ground and in the sky one after another, those of the ceilings along the ceilings.
     */
    readonly decors: Readonly<Record<string, number>>;
}
