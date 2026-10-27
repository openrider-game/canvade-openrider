import { Vector } from 'canvade';
import { Boost } from '../item/directional/boost';
import { Launcher } from '../item/directional/launcher';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { Bomb } from '../item/misc/bomb';
import { Mud } from '../item/misc/mud';
import { SlowMo } from '../item/misc/slow-mo';
import { EngineOff } from '../item/status/engine-off';
import { Heavy } from '../item/status/heavy';
import { Invincibility } from '../item/status/invincibility';
import { LowGravity } from '../item/status/low-gravity';
import { Mirror } from '../item/status/mirror';
import { NoSteer } from '../item/status/no-steer';
import { Reset } from '../item/status/reset';
import { Slippery } from '../item/status/slippery';
import { Turbo } from '../item/status/turbo';
import { ZeroGravity } from '../item/status/zero-gravity';
import type { BikeRunner } from '../bike/runner/bike-runner';
import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import {
    BACK_LIMIT,
    FALL_DEPTH,
    GROUND_OFFSET,
    LOADED_AHEAD,
    LOADED_BEHIND,
    UNITS_PER_METER,
} from './endurance.constants';
import { EnduranceRider } from './endurance-rider';
import { decorateSection } from './decoration/decorate';
import { TerrainGenerator } from './terrain-generator';
import { Point, SectionItemKind, TrackSection } from './terrain.types';
import { LATEST_GENERATOR_VERSION } from './terrain/versions';

/** Course of each track in endurance mode, for the tools only knowing the track. */
const COURSES = new WeakMap<Track, EnduranceCourse>();

/**
 * Ranks of the objects of a section, after those of the sections before (see
 * `TrackObject.order`): far more than the objects of a section.
 */
const SECTION_ORDERS = 1_000_000;

/** Creates the item of each kind of the sections, the rotation only for the directional ones. */
const ITEMS: Record<SectionItemKind, (pos: Vector, rotation: number, track: Track) => TrackObject> =
    {
        boost: (pos, rotation, track) => new Boost(pos, rotation, track),
        launcher: (pos, rotation, track) => new Launcher(pos, rotation, track),
        bomb: (pos, _, track) => new Bomb(pos, track),
        mud: (pos, _, track) => new Mud(pos, track),
        slowMo: (pos, _, track) => new SlowMo(pos, track),
        reset: (pos, _, track) => new Reset(pos, track),
        heavy: (pos, _, track) => new Heavy(pos, track),
        lowGravity: (pos, _, track) => new LowGravity(pos, track),
        zeroGravity: (pos, _, track) => new ZeroGravity(pos, track),
        slippery: (pos, _, track) => new Slippery(pos, track),
        turbo: (pos, _, track) => new Turbo(pos, track),
        engineOff: (pos, _, track) => new EngineOff(pos, track),
        mirror: (pos, _, track) => new Mirror(pos, track),
        noSteer: (pos, _, track) => new NoSteer(pos, track),
        invincibility: (pos, _, track) => new Invincibility(pos, track),
    };

/**
 * Infinite track of the endurance mode, generated from a seed (see {@link TerrainGenerator}),
 * and the runs of its runners (see {@link EnduranceRider}).
 *
 * Only the sections around the bikes are on the track, as lines and items of its main layer: the
 * sections from behind the slowest running bike to ahead of the furthest one, following the
 * player and the ghosts every physics tick ({@link EnduranceCourse.step}), and the riders of the
 * live session after each of their own ticks. Each runner starts its runs at the start whenever
 * it likes, its sections put back before its first tick, the others riding on. A run on a seed
 * always plays the same, as the ghosts, the live sessions and the backend replay it, whatever
 * the other runners do:
 *
 * - the sections are added long before a bike reaches them, and a bike never rides back to the
 *   sections taken off (see {@link BACK_LIMIT});
 * - the objects of each grid cell are always in the same order, which the collisions depend on:
 *   the order of their sections, then their order in their section, whatever the order the
 *   sections are added in (see `TrackObject.order`).
 */
export class EnduranceCourse {
    private readonly generator: TerrainGenerator;
    /** Objects of the sections on the track, by section index. */
    private readonly loaded = new Map<number, TrackObject[]>();
    /** Run of each runner, since it last started. */
    private readonly riders = new WeakMap<BikeRunner, EnduranceRider>();

    /**
     * @param seed - Seed of the track.
     * @param version - Version of the generator of the track, the latest one by default.
     * @throws When there is no such version.
     */
    public constructor(
        public readonly track: Track,
        seed: number,
        version = LATEST_GENERATOR_VERSION,
    ) {
        this.generator = new TerrainGenerator(
            seed,
            track.origin.x,
            track.origin.y + GROUND_OFFSET,
            version,
        );
        COURSES.set(track, this);
        track.onRunnerStart = (runner) => this.start(runner);
        track.onRemoteTick = (runner) => this.follow(runner);
        this.load();
    }

    /** Course of a track in endurance mode, null for the other tracks. */
    public static of(track: Track): EnduranceCourse | null {
        return COURSES.get(track) ?? null;
    }

    public get seed(): number {
        return this.generator.seed;
    }

    /** Version of the generator of the track: the same seed gives another track in another one. */
    public get version(): number {
        return this.generator.version;
    }

    /** Distance from the start position to a position, in meters. */
    public distanceAt(x: number): number {
        return Math.max(0, x - this.track.origin.x) / UNITS_PER_METER;
    }

    /** Difficulty at a position, from 0 at the start, see {@link TerrainGenerator}. */
    public difficultyAt(x: number): number {
        return this.generator.difficultyAt(x);
    }

    /**
     * Height under which a bike at a position fell into a gap: under the lowest ground of the
     * sections around it.
     */
    public fallLimitAt(x: number): number {
        const index = this.generator.sectionIndexAt(x);
        const sections = [index - 1, index, index + 1]
            .filter((i) => i >= 0)
            .map((i) => this.generator.section(i));
        return Math.max(...sections.map((section) => section.lowestY)) + FALL_DEPTH;
    }

    /** Run of a runner since it last started, null before. */
    public riderOf(runner: BikeRunner): EnduranceRider | null {
        return this.riders.get(runner) ?? null;
    }

    /**
     * Follows the runs of the player and the ghosts after a physics tick, then puts on the track
     * the sections coming ahead of the furthest bike, and takes off the ones out of reach.
     */
    public step(): void {
        for (const runner of [this.track.playerRunner, ...this.track.ghostRunners.values()]) {
            this.riderFor(runner)?.update();
        }
        this.load();
    }

    /** A runner starts a run: its sections are put back on the track before its first tick. */
    private start(runner: BikeRunner): void {
        this.riders.set(runner, new EnduranceRider(runner, this));
        this.load();
    }

    /** Follows the run of a rider of the live session after one of their physics ticks. */
    private follow(runner: BikeRunner): void {
        this.riderFor(runner)?.update();
        this.load();
    }

    /** Run of a runner, started with its bike if it has none yet; null without bike. */
    private riderFor(runner: BikeRunner): EnduranceRider | null {
        let rider = this.riders.get(runner);
        // A run starts with a bike, and goes on once the bike exploded, to end
        if (!rider && runner.instance) {
            rider = new EnduranceRider(runner, this);
            this.riders.set(runner, rider);
        }
        return rider ?? null;
    }

    /**
     * Puts on the track the sections from {@link LOADED_BEHIND} behind the slowest running bike
     * to {@link LOADED_AHEAD} ahead of the furthest one, of every runner on the track, and takes
     * off the others. Without running bike, the sections behind stay.
     */
    private load(): void {
        const runners = [
            this.track.playerRunner,
            ...this.track.ghostRunners.values(),
            ...this.track.remoteRunners.values(),
        ];
        // A bike whose run has not been followed yet is at the start, e.g. the player while a
        // rider of the session rides far ahead on its first tick
        const riders = runners.flatMap((runner) => this.riderFor(runner) ?? []);
        const running = riders.filter((rider) => !rider.over);
        const furthest = Math.max(this.track.origin.x, ...riders.map((rider) => rider.furthestX));
        const last = this.generator.sectionIndexAt(furthest + LOADED_AHEAD);
        const first = running.length
            ? this.generator.sectionIndexAt(
                  Math.min(...running.map((rider) => rider.furthestX)) - LOADED_BEHIND,
              )
            : this.loaded.size
              ? Math.min(...this.loaded.keys())
              : this.generator.sectionIndexAt(this.track.origin.x - LOADED_BEHIND);

        for (const [index, objects] of this.loaded) {
            if (index < first || index > last) {
                objects.forEach((object) => object.removeFromTrack());
                this.loaded.delete(index);
            }
        }
        for (let index = first; index <= last; index++) {
            if (!this.loaded.has(index)) {
                this.loaded.set(index, this.addSection(index, this.generator.section(index)));
            }
        }
    }

    private addSection(index: number, section: TrackSection): TrackObject[] {
        const layer = this.track.layers.main[0];
        const objects: TrackObject[] = [
            ...EnduranceCourse.lines(
                [...section.solid, ...section.ceilings],
                (from, to) => new SolidLine(from, to, this.track),
            ),
            // The distance posts, then the decoration of the biome
            ...EnduranceCourse.lines(
                [...section.scenery, ...decorateSection(section, this.seed, this.track.origin.x)],
                (from, to) => new SceneryLine(from, to, this.track),
            ),
            ...section.items.map((item) =>
                ITEMS[item.kind](new Vector(item.x, item.y), item.rotation, this.track),
            ),
        ];

        objects.forEach((object, i) => {
            object.layer = layer;
            object.order = index * SECTION_ORDERS + i;
            object.addToTrack();
        });
        return objects;
    }

    /** One line between each two following points of the polylines. */
    private static lines(
        polylines: Point[][],
        create: (from: Vector, to: Vector) => TrackObject,
    ): TrackObject[] {
        return polylines.flatMap((points) =>
            points
                .slice(1)
                .map((point, i) => create(new Vector(...points[i]), new Vector(...point))),
        );
    }
}
