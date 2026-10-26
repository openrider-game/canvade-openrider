import { Obstacle } from './obstacle';
import { boostClimb } from './obstacles/boost-climb';
import { bumps } from './obstacles/bumps';
import { ceiling } from './obstacles/ceiling';
import { climb } from './obstacles/climb';
import { downhill } from './obstacles/downhill';
import { drop } from './obstacles/drop';
import { flat } from './obstacles/flat';
import { islands } from './obstacles/islands';
import { jump } from './obstacles/jump';
import { kicker } from './obstacles/kicker';
import { launchGap } from './obstacles/launch-gap';
import { mudPit } from './obstacles/mud-pit';
import { rolling } from './obstacles/rolling';
import { slowDrop } from './obstacles/slow-drop';
import { stairs } from './obstacles/stairs';
import { tunnel } from './obstacles/tunnel';
import { valley } from './obstacles/valley';
import { Zone } from './zone';
import { coast } from './zones/coast';
import { heavy } from './zones/heavy';
import { ice } from './zones/ice';
import { mirror } from './zones/mirror';
import { moon } from './zones/moon';
import { noSteer } from './zones/no-steer';
import { shield } from './zones/shield';
import { space } from './zones/space';
import { turbo } from './zones/turbo';

/**
 * Obstacles and zones of a version of the generator, in the order they are picked in.
 *
 * A track is the same for a seed and a version, which the runs saved on it depend on: once
 * released, a version never changes, nor the order of its obstacles and zones, nor the obstacles
 * and zones themselves. New or changed obstacles and zones go into a new version, listing every
 * obstacle and zone it keeps. Every version stays, for the runs ridden on it.
 */
export interface GeneratorVersion {
    readonly version: number;
    readonly obstacles: readonly Obstacle[];
    readonly zones: readonly Zone[];
}

const VERSION_1: GeneratorVersion = {
    version: 1,
    obstacles: [
        flat,
        rolling,
        downhill,
        valley,
        climb,
        kicker,
        jump,
        drop,
        stairs,
        boostClimb,
        mudPit,
        slowDrop,
        bumps,
        islands,
        launchGap,
        tunnel,
        ceiling,
    ],
    zones: [moon, turbo, ice, coast, heavy, space, shield, noSteer, mirror],
};

/** Every version of the generator, by number. */
const VERSIONS = new Map<number, GeneratorVersion>([[1, VERSION_1]]);

/** Latest version of the generator, the one of the new tracks. */
export const LATEST_GENERATOR_VERSION = 1;

/** Whether a number is a version of the generator. */
export function isGeneratorVersion(version: number): boolean {
    return VERSIONS.has(version);
}

/**
 * A version of the generator.
 *
 * @throws When there is no such version.
 */
export function generatorVersion(version: number): GeneratorVersion {
    const generator = VERSIONS.get(version);
    if (!generator) {
        throw new Error(`Unknown version of the endurance generator: ${version}`);
    }
    return generator;
}
