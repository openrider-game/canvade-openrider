import { POST_SPACING } from '../endurance.constants';
import { SeededRandom } from '../seeded-random';
import type { Point, TrackSection } from '../terrain.types';
import { BiomeDecoration } from './biome-decoration';
import { arctic } from './biomes/arctic';
import { canyon } from './biomes/canyon';
import { caves } from './biomes/caves';
import { meadow } from './biomes/meadow';
import { mountains } from './biomes/mountains';
import type { Decor } from './decor';
import { DecorFactory } from './decor-factory';

/** The decoration of each biome, by name of the biome. A new one is added here. */
export const BIOME_DECORATIONS: ReadonlyMap<string, BiomeDecoration> = new Map(
    [meadow, mountains, canyon, caves, arctic].map((decoration) => [decoration.biome, decoration]),
);

/**
 * Salt of the seed of the decoration, so that its numbers are drawn apart from those of the
 * terrain and of the biomes: changing the decoration never changes the track.
 */
const DECORATION_SALT = 0x44454352,
    /** Steepest ground a decor stands on, as a slope. */
    MAX_SLOPE = 0.4,
    /** Distance kept from the edges of the gaps, the items and the distance posts. */
    CLEARANCE = 30,
    /** Room kept between a decor and the ceiling above it, or the ground under it. */
    HEADROOM = 25;

/** Height of polylines at a position, the top of those above each other; null where none go. */
function heightOn(polylines: readonly Point[][], x: number): number | null {
    let found: number | null = null;
    for (const points of polylines) {
        for (let i = 1; i < points.length; i++) {
            const [x0, y0] = points[i - 1];
            const [x1, y1] = points[i];
            if (x0 === x1 || x < Math.min(x0, x1) || x > Math.max(x0, x1)) {
                continue;
            }
            const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
            found = found === null ? y : Math.min(found, y);
        }
    }
    return found;
}

/**
 * Picks the decors of a placement at a regular pace with some jitter, keeping those that fit.
 *
 * @param fits - Where the decor goes at a position, null when it does not fit there.
 */
function scatter(
    section: TrackSection,
    decors: Decor[],
    weights: Readonly<Record<string, number>>,
    spacing: number,
    random: SeededRandom,
    fits: (decor: Decor, x: number) => number | null,
): Point[][] {
    if (decors.length === 0) {
        return [];
    }
    const picks = Object.fromEntries(decors.map((decor) => [decor.name, weights[decor.name]]));
    const shapes: Point[][] = [];
    for (
        let x = section.startX + random.range(0, spacing);
        x < section.endX;
        x += spacing * random.range(0.6, 1.4)
    ) {
        const decor = DecorFactory.create(random.pick(picks));
        const y = fits(decor, x);
        if (y !== null) {
            shapes.push(...decor.draw(x, y, random));
        }
    }
    return shapes;
}

/**
 * Decoration of a section of an endurance track, after its biome (see `biomes/`): trees, rocks,
 * cacti, crystals... as scenery polylines, none for the versions without biomes.
 *
 * Unlike the terrain, the decoration is no part of a version of the generator: scenery lines
 * touch no bike, so it can change from one release of the game to the next without changing any
 * run. It only depends on the section and the seed of the track, drawn from its own numbers.
 *
 * The decors stand on ground flat enough, clear of the edges of the gaps, of the items and of the
 * distance posts, and under the ceilings only when they fit; those of the ceilings hang from them
 * high enough over the ground.
 */
export function decorateSection(section: TrackSection, seed: number, originX: number): Point[][] {
    const decoration = section.biome ? BIOME_DECORATIONS.get(section.biome) : undefined;
    if (!decoration) {
        return [];
    }
    const random = new SeededRandom(
        SeededRandom.derive(SeededRandom.derive(seed, DECORATION_SALT), section.index),
    );
    const decors = Object.keys(decoration.decors).map((name) => DecorFactory.create(name));

    const ground = (x: number) => heightOn(section.solid, x);
    const ceiling = (x: number) => heightOn(section.ceilings, x);
    const clear = (x: number, halfWidth: number) => {
        // Distance to the closest distance post
        const fromPost = (((x - originX) % POST_SPACING) + POST_SPACING) % POST_SPACING;
        return (
            Math.min(fromPost, POST_SPACING - fromPost) > halfWidth + CLEARANCE &&
            section.items.every((item) => Math.abs(item.x - x) > halfWidth + CLEARANCE)
        );
    };

    // On the ground, or in the sky over it
    const onGround = scatter(
        section,
        decors.filter((decor) => decor.placement !== 'ceiling'),
        decoration.decors,
        decoration.spacing,
        random,
        (decor, x) => {
            // On ground on both sides, not leaning over a gap, nor on too steep a slope
            const margin = decor.halfWidth + CLEARANCE;
            const y = ground(x);
            const left = ground(x - margin);
            const right = ground(x + margin);
            if (y === null || left === null || right === null || !clear(x, decor.halfWidth)) {
                return null;
            }
            if (decor.placement !== 'sky' && Math.abs(right - left) / (2 * margin) > MAX_SLOPE) {
                return null;
            }
            // Under a ceiling, only when there is room, never in the sky
            const above = ceiling(x);
            const covered = above !== null && above < y;
            if (covered && (decor.placement === 'sky' || y - above < decor.height + HEADROOM)) {
                return null;
            }
            return y;
        },
    );

    // Hanging from the ceilings, clear of the ground under them
    const ceilingSpacing = decoration.ceilingSpacing;
    const hanging = ceilingSpacing
        ? scatter(
              section,
              decors.filter((decor) => decor.placement === 'ceiling'),
              decoration.decors,
              ceilingSpacing,
              random,
              (decor, x) => {
                  const y = ceiling(x);
                  const floor = ground(x);
                  const room =
                      y !== null && floor !== null && floor - y > decor.height + 2 * HEADROOM;
                  return room && clear(x, decor.halfWidth) ? y : null;
              },
          )
        : [];

    return [...onGround, ...hanging];
}
