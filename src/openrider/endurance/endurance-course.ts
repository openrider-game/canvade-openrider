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
import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import {
    FALL_DEPTH,
    GROUND_OFFSET,
    LOADED_AHEAD,
    LOADED_BEHIND,
    UNITS_PER_METER,
} from './endurance.constants';
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
 * Infinite track of the endurance mode, generated from a seed (see {@link TerrainGenerator}).
 *
 * Only the sections around the bike are on the track, as lines and items of its main layer:
 * {@link EnduranceCourse.update} adds the sections coming ahead of the bike and removes the ones
 * left far behind, every physics tick. The sections are added long before the bike reaches them,
 * so the physics never depends on when they were added: a run on a seed always plays the same.
 */
export class EnduranceCourse {
    private generator: TerrainGenerator;
    /** Objects of the sections on the track, by section index. */
    private readonly loaded = new Map<number, TrackObject[]>();

    public constructor(
        public readonly track: Track,
        seed: number,
    ) {
        this.generator = new TerrainGenerator(seed, track.origin.x, track.origin.y + GROUND_OFFSET);
        COURSES.set(track, this);
        this.update(track.origin.x);
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

    /** Puts on the track the sections around a position, and takes off the other ones. */
    public update(x: number): void {
        const first = this.generator.sectionIndexAt(x - LOADED_BEHIND);
        const last = this.generator.sectionIndexAt(x + LOADED_AHEAD);

        for (const [index, objects] of this.loaded) {
            if (index < first || index > last) {
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

    /** Replaces the track with the one of another seed, the bike going back to the start. */
    public reset(seed: number): void {
        this.loaded.forEach((objects) => objects.forEach((object) => object.removeFromTrack()));
        this.loaded.clear();
        this.generator = new TerrainGenerator(
            seed,
            this.track.origin.x,
            this.track.origin.y + GROUND_OFFSET,
        );
        this.update(this.track.origin.x);
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
