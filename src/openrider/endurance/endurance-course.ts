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
import { Point, SectionItemKind, TerrainGenerator, TrackSection } from './terrain-generator';

/** Course of each track in endurance mode, for the tools only knowing the track. */
const COURSES = new WeakMap<Track, EnduranceCourse>();

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
 * Only the sections around the bikes are on the track, as lines and items of its main layer:
 * {@link EnduranceCourse.step} adds the sections coming ahead of the furthest bike and removes the
 * ones left behind the slowest running one, every physics tick. A run on a seed always plays the
 * same, as the ghosts and the backend replay it, whatever the other runners do:
 *
 * - the sections are added long before a bike reaches them, and a bike never rides back to the
 *   sections taken off (see {@link BACK_LIMIT});
 * - the sections are only added in order, after the ones on the track, and every restart starts
 *   over from an empty track: the objects of each grid cell are always in the same order, which
 *   the collisions depend on.
 */
export class EnduranceCourse {
    private generator: TerrainGenerator;
    /** Objects of the sections on the track, by section index. */
    private readonly loaded = new Map<number, TrackObject[]>();
    /** Runs of the runners since the last restart. */
    private readonly riders = new Map<BikeRunner, EnduranceRider>();
    /** Positions the sections are loaded behind and ahead of, only growing until a restart. */
    private behindX: number;
    private aheadX: number;

    public constructor(
        public readonly track: Track,
        seed: number,
    ) {
        this.generator = new TerrainGenerator(seed, track.origin.x, track.origin.y + GROUND_OFFSET);
        this.behindX = this.aheadX = track.origin.x;
        COURSES.set(track, this);
        // The runners start over: the track too, before the first physics tick of their runs
        track.onRestart = () => this.restart();
        this.load();
    }

    /** Course of a track in endurance mode, null for the other tracks. */
    public static of(track: Track): EnduranceCourse | null {
        return COURSES.get(track) ?? null;
    }

    public get seed(): number {
        return this.generator.seed;
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

    /** Run of a runner since the last restart, null before its first physics tick. */
    public riderOf(runner: BikeRunner): EnduranceRider | null {
        return this.riders.get(runner) ?? null;
    }

    /**
     * Follows the runs after a physics tick, the player then the ghosts, then puts on the track
     * the sections coming ahead of the furthest bike, and takes off the ones behind every
     * running bike.
     */
    public step(): void {
        const runners = [this.track.playerRunner, ...this.track.ghostRunners.values()];
        const riders: EnduranceRider[] = [];
        for (const runner of runners) {
            // A run starts with a bike, and goes on once the bike exploded, to end
            let rider = this.riders.get(runner);
            if (!rider && runner.instance) {
                rider = new EnduranceRider(runner, this);
                this.riders.set(runner, rider);
            }
            if (rider) {
                rider.update();
                riders.push(rider);
            }
        }

        const running = riders.filter((rider) => !rider.over);
        if (running.length > 0) {
            const slowest = Math.min(...running.map((rider) => rider.furthestX));
            this.behindX = Math.max(this.behindX, slowest);
        }
        this.aheadX = Math.max(this.aheadX, ...riders.map((rider) => rider.furthestX));
        this.load();
    }

    /** Replaces the track with the one of another seed, the bikes going back to the start. */
    public reset(seed: number): void {
        this.generator = new TerrainGenerator(
            seed,
            this.track.origin.x,
            this.track.origin.y + GROUND_OFFSET,
        );
        this.restart();
    }

    /** Starts over from an empty track, the runs starting over with the runners. */
    public restart(): void {
        this.loaded.forEach((objects) => objects.forEach((object) => object.removeFromTrack()));
        this.loaded.clear();
        this.riders.clear();
        this.behindX = this.aheadX = this.track.origin.x;
        this.load();
    }

    /**
     * Puts on the track the sections from {@link LOADED_BEHIND} behind the slowest running bike
     * to {@link LOADED_AHEAD} ahead of the furthest one, in order, and takes off the ones behind.
     */
    private load(): void {
        const first = this.generator.sectionIndexAt(this.behindX - LOADED_BEHIND);
        const last = this.generator.sectionIndexAt(this.aheadX + LOADED_AHEAD);

        for (const [index, objects] of this.loaded) {
            if (index < first) {
                objects.forEach((object) => object.removeFromTrack());
                this.loaded.delete(index);
            }
        }
        for (let index = first; index <= last; index++) {
            if (!this.loaded.has(index)) {
                this.loaded.set(index, this.addSection(this.generator.section(index)));
            }
        }
    }

    private addSection(section: TrackSection): TrackObject[] {
        const layer = this.track.layers.main[0];
        const objects: TrackObject[] = [
            ...EnduranceCourse.lines(
                [...section.solid, ...section.ceilings],
                (from, to) => new SolidLine(from, to, this.track),
            ),
            ...EnduranceCourse.lines(
                section.scenery,
                (from, to) => new SceneryLine(from, to, this.track),
            ),
            ...section.items.map((item) =>
                ITEMS[item.kind](new Vector(item.x, item.y), item.rotation, this.track),
            ),
        ];

        for (const object of objects) {
            object.layer = layer;
            object.addToTrack();
        }
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
