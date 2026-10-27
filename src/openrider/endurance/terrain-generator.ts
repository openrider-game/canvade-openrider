import {
    DIFFICULTY_DISTANCE,
    MAX_DIFFICULTY,
    SECTION_LENGTH,
    START_RUNWAY,
} from './endurance.constants';
import { GroundPen } from './ground-pen';
import { SeededRandom } from './seeded-random';
import { Biome, BiomePlan, blendBiomes, NEUTRAL_BIOME } from './terrain/biome';
import { drawObstacle, Obstacle } from './terrain/obstacle';
import { generatorVersion, GeneratorVersion, LATEST_GENERATOR_VERSION } from './terrain/versions';
import { drawZone, Zone } from './terrain/zone';
import { TrackSection } from './terrain.types';

/**
 * Generates an endurance track from a seed, section by section along the x axis, each section
 * going on from the end of the previous one.
 *
 * A section is made of obstacles and zones picked at random, with a difficulty growing with the
 * distance: the obstacles get bigger (higher hills, wider gaps, deeper drops) and new ones come
 * (stairs, platforms, tunnels, bombs), then zones under status effects (low gravity, turbo,
 * ice, mirrored controls...), ended by reset items. Each section draws its numbers from its own
 * seed, derived from the seed of the track: the track is always the same for a seed and a
 * version of the generator (see `terrain/versions.ts`), whatever the order the sections are
 * asked in.
 *
 * In the versions with biomes, the sections follow the biomes of the track (see `BiomePlan`),
 * each one changing the weights of the obstacles and zones, and the size of the obstacles.
 */
export class TerrainGenerator {
    private readonly sections: TrackSection[] = [];
    private readonly generator: GeneratorVersion;
    /** Biomes of the track, null for the versions without biomes. */
    private readonly biomes: BiomePlan | null;
    private endX: number;
    private endY: number;

    /**
     * @param seed - Seed of the track.
     * @param originX - Start position of the bikes, the distances being counted from it.
     * @param groundY - Height of the ground at the start.
     * @param version - Version of the generator, the latest one by default.
     * @throws When there is no such version.
     */
    public constructor(
        public readonly seed: number,
        private readonly originX: number,
        groundY: number,
        public readonly version = LATEST_GENERATOR_VERSION,
    ) {
        this.generator = generatorVersion(version);
        this.endX = originX - 200;
        this.endY = groundY;
        const biomes = this.generator.biomes;
        this.biomes = biomes?.length
            ? new BiomePlan(seed, biomes, (x) => this.difficultyAt(x), originX)
            : null;
    }

    /** Difficulty at a position, from 0 at the start, 1 after {@link DIFFICULTY_DISTANCE}. */
    public difficultyAt(x: number): number {
        return Math.min(MAX_DIFFICULTY, Math.max(0, (x - this.originX) / DIFFICULTY_DISTANCE));
    }

    /** A section by its index, generating it and the ones before it when needed. */
    public section(index: number): TrackSection {
        while (this.sections.length <= index) {
            this.sections.push(this.generate(this.sections.length));
        }
        return this.sections[index];
    }

    /** Index of the section holding a position, the first one for the positions before it. */
    public sectionIndexAt(x: number): number {
        let index = 0;
        while (this.section(index).endX <= x) {
            index++;
        }
        return index;
    }

    /**
     * Biome of a section: halfway from the previous one in the first section of a biome, the
     * neutral biome without biomes.
     */
    private biomeOf(index: number): Biome {
        if (!this.biomes) {
            return NEUTRAL_BIOME;
        }
        const { biome, previous } = this.biomes.at(index);
        return previous ? blendBiomes(previous, biome) : biome;
    }

    private generate(index: number): TrackSection {
        const random = new SeededRandom(SeededRandom.derive(this.seed, index));
        const biome = this.biomeOf(index);
        const pen = new GroundPen(this.endX, this.endY, this.originX);
        const startX = this.endX;
        const parts: TrackSection['parts'] = [];

        if (index === 0) {
            pen.lineTo(this.originX + START_RUNWAY, pen.y);
        }
        while (pen.x < startX + SECTION_LENGTH) {
            const difficulty = this.difficultyAt(pen.x);
            const zones = TerrainGenerator.weights(this.generator.zones, difficulty, biome.zones);
            const zoneShare = Object.values(zones).some((weight) => weight > 0)
                ? (0.1 + 0.15 * Math.min(1, difficulty)) * biome.zoneShare
                : 0;
            if (random.chance(zoneShare)) {
                const zone = this.pickIn(this.generator.zones, random.pick(zones));
                parts.push({ kind: `${zone.name} zone`, startX: pen.x });
                drawZone(pen, zone, difficulty, random);
            } else {
                const weights = TerrainGenerator.weights(
                    this.generator.obstacles,
                    difficulty,
                    biome.obstacles,
                );
                const obstacle = this.pickIn(this.generator.obstacles, random.pick(weights));
                parts.push({ kind: obstacle.name, startX: pen.x });
                drawObstacle(pen, obstacle, difficulty, random, biome.options);
            }
        }

        const solid = pen.finish();
        [this.endX, this.endY] = [pen.x, pen.y];

        return {
            index,
            startX,
            endX: pen.x,
            difficulty: this.difficultyAt(startX),
            solid,
            ceilings: pen.ceilings,
            scenery: pen.scenery,
            items: pen.items,
            parts,
            lowestY: pen.lowestY,
            // Only with biomes, the sections of the other versions staying as they are
            ...(this.biomes ? { biome: biome.name } : {}),
        };
    }

    /**
     * Weights of the obstacles or zones of the version at a difficulty, by name, in order, times
     * the factors of a biome. Without any left by the biome, the weights of the version.
     */
    private static weights(
        choices: readonly (Obstacle | Zone)[],
        d: number,
        factors: Readonly<Record<string, number>>,
    ) {
        const weights = choices.map((choice): [string, number] => [
            choice.name,
            choice.weight(d) * (factors[choice.name] ?? 1),
        ]);
        if (weights.every(([, weight]) => weight <= 0)) {
            return Object.fromEntries(choices.map((choice) => [choice.name, choice.weight(d)]));
        }
        return Object.fromEntries(weights);
    }

    /** An obstacle or zone of the version, by the name picked. */
    private pickIn<T extends Obstacle | Zone>(choices: readonly T[], name: string): T {
        return choices.find((choice) => choice.name === name) as T;
    }
}
