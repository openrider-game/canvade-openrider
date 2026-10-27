import { SECTION_LENGTH } from '../endurance.constants';
import { SeededRandom } from '../seeded-random';
import { DEFAULT_OPTIONS, ObstacleOptions } from './obstacle';

/**
 * Biome of the terrain: a long stretch of track of a same character, e.g. canyons full of gaps,
 * one per file of `biomes/`, listed by the versions of the generator having biomes (see
 * `versions.ts`).
 *
 * A biome draws nothing itself: it changes which obstacles and zones of its version come, and
 * how big the obstacles are. As the obstacles, a biome released in a version never changes.
 */
export interface Biome {
    /** Name of the biome, unique in a version, shown to the player when entering it. */
    readonly name: string;
    /** How often the biome comes at a difficulty, among the biomes; 0 for never. */
    weight(d: number): number;
    /** Number of sections of the biome, between both included. */
    readonly length: readonly [number, number];
    /** Factors of the weights of the obstacles of the version, by name; 1 when not listed. */
    readonly obstacles: Readonly<Record<string, number>>;
    /** Factors of the weights of the zones of the version, by name; 1 when not listed. */
    readonly zones: Readonly<Record<string, number>>;
    /** Factor of the share of zones among the obstacles. */
    readonly zoneShare: number;
    /** Options of the obstacles outside the zones, which keep their own. */
    readonly options: ObstacleOptions;
}

/** The terrain of the versions without biomes: every weight as it is. */
export const NEUTRAL_BIOME: Biome = {
    name: '',
    weight: () => 0,
    length: [1, 1],
    obstacles: {},
    zones: {},
    zoneShare: 1,
    options: DEFAULT_OPTIONS,
};

/** Biomes following each other, by section. */
interface BiomeSpan {
    biome: Biome;
    /** First section of the biome, and the one after its last. */
    start: number;
    end: number;
}

/**
 * Salt of the seed of the biomes, so that their numbers are drawn apart from the ones of the
 * sections (see `TerrainGenerator`), whatever biomes come.
 */
const BIOME_SALT = 0x42494f4d;

/**
 * Biomes of a track, one after another, drawn from the seed of the track: the first biome of
 * the version first, then biomes picked by weight at the difficulty they start at, never the same
 * one twice in a row, each one lasting a number of sections drawn in its length.
 *
 * The plan only depends on the seed and the biomes, not on the terrain: each biome draws its
 * numbers from its own seed, and the difficulty of a section is the one at its expected start.
 */
export class BiomePlan {
    private readonly spans: BiomeSpan[] = [];

    /**
     * @param biomes - Biomes of the version, the first one starting the tracks.
     * @param difficultyAt - Difficulty at a position, see `TerrainGenerator.difficultyAt`.
     * @param originX - Start position of the bikes, where the first section starts about.
     */
    public constructor(
        private readonly seed: number,
        private readonly biomes: readonly Biome[],
        private readonly difficultyAt: (x: number) => number,
        private readonly originX: number,
    ) {}

    /**
     * Biome of a section, and the one before it when the section starts the biome, null
     * otherwise or for the first biome.
     */
    public at(index: number): { biome: Biome; previous: Biome | null } {
        while (this.spans.length === 0 || this.spans[this.spans.length - 1].end <= index) {
            this.spans.push(this.next());
        }
        const at = this.spans.findIndex((span) => span.end > index);
        const span = this.spans[at];
        const previous = at > 0 && span.start === index ? this.spans[at - 1].biome : null;
        return { biome: span.biome, previous };
    }

    /** The biome after the last one planned. */
    private next(): BiomeSpan {
        const count = this.spans.length;
        const start = count === 0 ? 0 : this.spans[count - 1].end;
        const random = new SeededRandom(
            SeededRandom.derive(SeededRandom.derive(this.seed, BIOME_SALT), count),
        );

        let biome = this.biomes[0];
        if (count > 0) {
            const last = this.spans[count - 1].biome;
            const d = this.difficultyAt(this.originX + start * SECTION_LENGTH);
            const weights = Object.fromEntries(
                this.biomes.map((choice) => [choice.name, choice === last ? 0 : choice.weight(d)]),
            );
            // Another biome than the last one, if any comes at that difficulty
            if (Object.values(weights).some((weight) => weight > 0)) {
                const name = random.pick(weights);
                biome = this.biomes.find((choice) => choice.name === name) ?? last;
            } else {
                biome = last;
            }
        }

        const [min, max] = biome.length;
        return { biome, start, end: start + random.int(min, max) };
    }
}

/**
 * Halfway between two biomes, for the first section of a biome after another: the terrain
 * changes over a section, rather than at once.
 */
export function blendBiomes(from: Biome, to: Biome): Biome {
    const factors = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) =>
        Object.fromEntries(
            [...new Set([...Object.keys(a), ...Object.keys(b)])].map((name) => [
                name,
                ((a[name] ?? 1) + (b[name] ?? 1)) / 2,
            ]),
        );
    return {
        ...to,
        obstacles: factors(from.obstacles, to.obstacles),
        zones: factors(from.zones, to.zones),
        zoneShare: (from.zoneShare + to.zoneShare) / 2,
        options: {
            gapScale: (from.options.gapScale + to.options.gapScale) / 2,
            harshness: (from.options.harshness + to.options.harshness) / 2,
        },
    };
}
