import {
    DIFFICULTY_DISTANCE,
    MAX_DIFFICULTY,
    POST_SPACING,
    SECTION_LENGTH,
    START_RUNWAY,
} from './endurance.constants';
import { SeededRandom } from './seeded-random';

/** Point in world units, y pointing down. */
export type Point = readonly [x: number, y: number];

/** Kinds of the items of the sections, see `EnduranceCourse`. */
export type SectionItemKind =
    | 'boost'
    | 'launcher'
    | 'bomb'
    | 'mud'
    | 'slowMo'
    | 'reset'
    | 'heavy'
    | 'lowGravity'
    | 'zeroGravity'
    | 'slippery'
    | 'turbo'
    | 'engineOff'
    | 'mirror'
    | 'noSteer'
    | 'invincibility';

/** Item of a section. */
export interface SectionItem {
    kind: SectionItemKind;
    x: number;
    y: number;
    /** Direction of a boost or a launcher, in degrees, 0 pointing down and 270 to the right. */
    rotation: number;
}

/** Part of an endurance track, generated as a whole. */
export interface TrackSection {
    index: number;
    /** Horizontal extent of the section, from the end of the previous one. */
    startX: number;
    endX: number;
    /** Difficulty at the start of the section, from 0, see {@link TerrainGenerator.difficultyAt}. */
    difficulty: number;
    /** Ground the bikes ride on, as polylines cut by the gaps. */
    solid: Point[][];
    /** Ceilings of the tunnels, solid too, over the ground. */
    ceilings: Point[][];
    /** Decoration: the distance posts. */
    scenery: Point[][];
    items: SectionItem[];
    /** Obstacles and zones of the section, in order, with where they start. */
    parts: Array<{ kind: string; startX: number }>;
    /** Lowest point of the ground of the section, the largest y. */
    lowestY: number;
}

/** Obstacles of the terrain, see {@link TerrainGenerator.drawObstacle}. */
type Obstacle =
    | 'flat'
    | 'rolling'
    | 'downhill'
    | 'valley'
    | 'climb'
    | 'kicker'
    | 'jump'
    | 'drop'
    | 'stairs'
    | 'bumps'
    | 'islands'
    | 'tunnel'
    | 'ceiling'
    | 'boostClimb'
    | 'launchGap'
    | 'mudPit'
    | 'slowDrop';

/** Zones of the terrain under a status effect, see {@link TerrainGenerator.drawZone}. */
type Zone =
    'moon' | 'turbo' | 'ice' | 'coast' | 'heavy' | 'space' | 'shield' | 'noSteer' | 'mirror';

/** Options of the obstacles drawn in a zone. */
interface ObstacleOptions {
    /** Factor of the width of the gaps, larger under low gravity or turbo. */
    gapScale: number;
    /** Factor of the size of the bumps and drops, larger under invincibility. */
    harshness: number;
}

const DEFAULT_OPTIONS: ObstacleOptions = { gapScale: 1, harshness: 1 };

/** Obstacles inside each zone, picked at random, and the options they are drawn with. */
const ZONES: Record<
    Zone,
    { effect: SectionItemKind; obstacles: Obstacle[]; options: ObstacleOptions }
> = {
    // Low gravity: further jumps over wider gaps
    moon: {
        effect: 'lowGravity',
        obstacles: ['jump', 'kicker', 'rolling'],
        options: { gapScale: 1.2, harshness: 1 },
    },
    // A faster bike, slightly wider gaps
    turbo: {
        effect: 'turbo',
        obstacles: ['jump', 'rolling', 'drop', 'kicker'],
        options: { gapScale: 1.3, harshness: 1 },
    },
    // Slippery wheels: gentle ground, hard to climb
    ice: {
        effect: 'slippery',
        obstacles: ['rolling', 'downhill', 'flat'],
        options: DEFAULT_OPTIONS,
    },
    heavy: { effect: 'heavy', obstacles: ['climb', 'rolling', 'bumps'], options: DEFAULT_OPTIONS },
    noSteer: {
        effect: 'noSteer',
        obstacles: ['rolling', 'flat', 'drop'],
        options: DEFAULT_OPTIONS,
    },
    mirror: {
        effect: 'mirror',
        obstacles: ['rolling', 'bumps', 'kicker'],
        options: DEFAULT_OPTIONS,
    },
    // Invincible: much harsher bumps and drops, bombs included
    shield: {
        effect: 'invincibility',
        obstacles: ['bumps', 'drop', 'stairs', 'ceiling'],
        options: { gapScale: 1, harshness: 2 },
    },
    // Drawn by their own functions
    coast: { effect: 'engineOff', obstacles: [], options: DEFAULT_OPTIONS },
    space: { effect: 'zeroGravity', obstacles: [], options: DEFAULT_OPTIONS },
};

/** Spacing and number of the reset items ending a zone, stacked high enough to catch a jump. */
const RESET_SPACING = 33,
    RESET_COUNT = 7;

/**
 * Pen drawing the ground of a section from point to point, cutting it at the gaps, and placing
 * the distance posts where the ground crosses them.
 */
class GroundPen {
    public readonly polylines: Point[][] = [];
    public readonly ceilings: Point[][] = [];
    public readonly scenery: Point[][] = [];
    public readonly items: SectionItem[] = [];
    public lowestY: number;
    private current: Point[];

    public constructor(
        public x: number,
        public y: number,
        private readonly originX: number,
    ) {
        this.current = [[x, y]];
        this.lowestY = y;
    }

    /** Draws the ground to a point, in whole world units as in the track codes. */
    public lineTo(x: number, y: number): void {
        const [toX, toY] = [Math.round(x), Math.round(y)];
        // Too short to be a line of the track
        if (Math.hypot(toX - this.x, toY - this.y) < 2) {
            return;
        }

        this.placePosts(toX, toY);
        this.current.push([toX, toY]);
        [this.x, this.y] = [toX, toY];
        this.lowestY = Math.max(this.lowestY, toY);
    }

    /** Leaves a gap in the ground up to a point, where the ground goes on. */
    public gapTo(x: number, y: number): void {
        this.endPolyline();
        [this.x, this.y] = [Math.round(x), Math.round(y)];
        this.current = [[this.x, this.y]];
        this.lowestY = Math.max(this.lowestY, this.y);
    }

    /** Adds a ceiling over the ground, solid too. */
    public addCeiling(points: Point[]): void {
        this.ceilings.push(points.map(([x, y]) => [Math.round(x), Math.round(y)]));
    }

    public addItem(kind: SectionItemKind, x: number, y: number, rotation = 0): void {
        this.items.push({ kind, x: Math.round(x), y: Math.round(y), rotation });
    }

    /** Ends the drawing, keeping the polylines of at least one line. */
    public finish(): Point[][] {
        this.endPolyline();
        return this.polylines;
    }

    private endPolyline(): void {
        if (this.current.length > 1) {
            this.polylines.push(this.current);
        }
    }

    /** A post with a flag at each multiple of the post spacing crossed by a line. */
    private placePosts(toX: number, toY: number): void {
        const first = Math.floor((this.x - this.originX) / POST_SPACING) + 1;
        const last = Math.floor((toX - this.originX) / POST_SPACING);
        for (let post = Math.max(first, 1); post <= last; post++) {
            const postX = this.originX + post * POST_SPACING;
            const postY = Math.round(this.y + ((toY - this.y) * (postX - this.x)) / (toX - this.x));
            this.scenery.push(
                [
                    [postX, postY],
                    [postX, postY - 80],
                ],
                [
                    [postX, postY - 80],
                    [postX + 30, postY - 70],
                    [postX, postY - 60],
                ],
            );
        }
    }
}

/**
 * Generates an endurance track from a seed, section by section along the x axis, each section
 * going on from the end of the previous one.
 *
 * A section is made of obstacles and zones picked at random, with a difficulty growing with the
 * distance: the obstacles get bigger (higher hills, wider gaps, deeper drops) and new ones come
 * (stairs, platforms, tunnels, bombs), then zones under status effects (low gravity, turbo,
 * ice, mirrored controls...), ended by reset items. Each section draws its numbers from its own
 * seed, derived from the seed of the track: the track is always the same for a seed, whatever
 * the order the sections are asked in.
 */
export class TerrainGenerator {
    private readonly sections: TrackSection[] = [];
    private endX: number;
    private endY: number;

    /**
     * @param seed - Seed of the track.
     * @param originX - Start position of the bikes, the distances being counted from it.
     * @param groundY - Height of the ground at the start.
     */
    public constructor(
        public readonly seed: number,
        private readonly originX: number,
        groundY: number,
    ) {
        this.endX = originX - 200;
        this.endY = groundY;
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

    private generate(index: number): TrackSection {
        const random = new SeededRandom(SeededRandom.derive(this.seed, index));
        const pen = new GroundPen(this.endX, this.endY, this.originX);
        const startX = this.endX;
        const parts: TrackSection['parts'] = [];

        if (index === 0) {
            pen.lineTo(this.originX + START_RUNWAY, pen.y);
        }
        while (pen.x < startX + SECTION_LENGTH) {
            const difficulty = this.difficultyAt(pen.x);
            const zones = TerrainGenerator.zoneWeights(difficulty);
            const zoneShare = Object.values(zones).some((weight) => weight > 0)
                ? 0.1 + 0.15 * Math.min(1, difficulty)
                : 0;
            if (random.chance(zoneShare)) {
                const zone = random.pick(zones);
                parts.push({ kind: `${zone} zone`, startX: pen.x });
                this.drawZone(pen, zone, difficulty, random);
            } else {
                const obstacle = random.pick(TerrainGenerator.obstacleWeights(difficulty));
                parts.push({ kind: obstacle, startX: pen.x });
                this.drawObstacle(pen, obstacle, difficulty, random, DEFAULT_OPTIONS);
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
        };
    }

    /** How often each obstacle comes at a difficulty, the hardest ones only coming later. */
    private static obstacleWeights(d: number): Record<Obstacle, number> {
        const from = (start: number, weight: number) => (d >= start ? weight : 0);
        return {
            flat: Math.max(0.5, 2.2 - 1.5 * d),
            rolling: 1.6,
            downhill: 0.8,
            valley: 0.8,
            climb: 0.7,
            kicker: from(0.1, 0.8),
            jump: from(0.05, 0.6 + 1.4 * d),
            drop: from(0.1, 1.1 * d),
            stairs: from(0.15, 0.8),
            boostClimb: from(0.1, 0.6),
            mudPit: from(0.15, 0.6),
            slowDrop: from(0.2, 0.5),
            bumps: from(0.25, 1.3 * d),
            islands: from(0.25, 0.4 + 0.6 * d),
            launchGap: from(0.3, 0.4 + 0.6 * d),
            tunnel: from(0.35, 0.7),
            ceiling: from(0.45, 0.3 + 1.1 * (d - 0.45)),
        };
    }

    /** How often each zone comes at a difficulty, among the zones. */
    private static zoneWeights(d: number): Record<Zone, number> {
        const from = (start: number, weight: number) => (d >= start ? weight : 0);
        return {
            moon: from(0.2, 1),
            turbo: from(0.25, 1),
            ice: from(0.3, 0.8),
            coast: from(0.3, 0.7),
            heavy: from(0.35, 0.8),
            space: from(0.4, 0.6),
            shield: from(0.4, 0.5),
            noSteer: from(0.5, 0.6),
            mirror: from(0.55, 0.7),
        };
    }

    /**
     * Draws a zone under a status effect: the effect at its start, two or three obstacles, then
     * a column of reset items, high enough to catch a bike jumping over them.
     */
    private drawZone(pen: GroundPen, zone: Zone, d: number, random: SeededRandom): void {
        const { effect, obstacles, options } = ZONES[zone];

        pen.lineTo(pen.x + 60, pen.y);
        // At the height of the wheels and of the rider
        pen.addItem(effect, pen.x, pen.y - 12);
        pen.addItem(effect, pen.x, pen.y - 45);
        pen.lineTo(pen.x + 80, pen.y);

        if (zone === 'space') {
            // Floating straight over a gap to a platform at the same height
            const gap = random.range(220, 360) + 120 * Math.min(1, d);
            pen.lineTo(pen.x + 120, pen.y);
            pen.gapTo(pen.x + gap, pen.y);
            pen.lineTo(pen.x + 160, pen.y);
        } else if (zone === 'coast') {
            // Engine off down a long slope, the momentum carrying the bike over a rise
            const drop = random.range(120, 200);
            TerrainGenerator.curve(
                pen,
                random.range(380, 480),
                drop,
                (k) => (1 - Math.cos(Math.PI * k)) / 2,
            );
            pen.lineTo(pen.x + 120, pen.y);
            TerrainGenerator.curve(pen, 160, -drop * 0.3, (k) => (1 - Math.cos(Math.PI * k)) / 2);
            pen.lineTo(pen.x + 60, pen.y);
        } else {
            for (let count = random.int(2, 3); count > 0; count--) {
                this.drawObstacle(
                    pen,
                    obstacles[random.int(0, obstacles.length - 1)],
                    d,
                    random,
                    options,
                );
            }
        }

        pen.lineTo(pen.x + 60, pen.y);
        for (let reset = 0; reset < RESET_COUNT; reset++) {
            pen.addItem('reset', pen.x, pen.y - 12 - RESET_SPACING * reset);
        }
        pen.lineTo(pen.x + 80, pen.y);
    }

    /** Draws an obstacle from the position of the pen, its size growing with the difficulty. */
    private drawObstacle(
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

        switch (obstacle) {
            case 'flat':
                pen.lineTo(x + random.range(120, 260), y);
                break;

            case 'rolling':
                // Hills and dips, higher and shorter as the difficulty grows
                for (let wave = random.int(2, 4); wave > 0; wave--) {
                    const length = random.range(260, 420) * (1 - 0.35 * t);
                    const height = (15 + 40 * d) * random.range(0.7, 1.3);
                    const direction = random.chance(0.5) ? -1 : 1;
                    TerrainGenerator.curve(
                        pen,
                        length,
                        direction * height,
                        (k) => (1 - Math.cos(2 * Math.PI * k)) / 2,
                    );
                }
                break;

            case 'downhill':
                // A long descent gaining speed, then a run-out
                TerrainGenerator.curve(
                    pen,
                    random.range(450, 700),
                    random.range(60, 140) + 120 * t,
                    ease,
                );
                pen.lineTo(pen.x + 120, pen.y);
                break;

            case 'valley': {
                // A wide dip, as a half-pipe, getting deeper
                const depth = random.range(30, 80) + 80 * t;
                TerrainGenerator.curve(
                    pen,
                    random.range(380, 560),
                    depth,
                    (k) => (1 - Math.cos(2 * Math.PI * k)) / 2,
                );
                break;
            }

            case 'climb': {
                // A long climb, never steeper than about 30 degrees, then a crest
                const length = random.range(250, 400);
                const height = Math.min(length * 0.55, (60 + 100 * d) * random.range(0.8, 1.2));
                TerrainGenerator.curve(pen, length, -height, ease);
                pen.lineTo(pen.x + 80, pen.y);
                break;
            }

            case 'kicker': {
                // A short steep kicker throwing the bike in the air, landing down a slope
                pen.lineTo(x + 100, y);
                TerrainGenerator.curve(pen, 50, -(14 + 14 * t), (k) => k * k);
                pen.lineTo(pen.x + 30, pen.y);
                TerrainGenerator.curve(pen, 200, 60 + 30 * t, ease);
                pen.lineTo(pen.x + 100, pen.y);
                break;
            }

            case 'jump': {
                // A run-up, a ramp, a gap, and a landing going down along the fall of the bike.
                // The wider gaps come with a boost on the run-up, sometimes
                pen.lineTo(x + 160, y);
                if (d >= 0.3 && random.chance(0.25 + 0.25 * t)) {
                    pen.addItem('boost', x + 70, y - 10, 270);
                }
                const rise = 12 + 26 * d;
                TerrainGenerator.curve(pen, 140, -rise, (k) => k * k);
                const gap = (70 + 150 * d) * random.range(0.85, 1.15) * gapScale;
                pen.gapTo(pen.x + gap, pen.y + 30 + 40 * d);
                // The landing stretches with the gap, e.g. under low gravity
                TerrainGenerator.curve(pen, 220 * gapScale, 60, (k) => k * (2 - k));
                pen.lineTo(pen.x + 120, pen.y);
                break;
            }

            case 'drop': {
                // A lip, a steep slope down, and a flat landing
                const height = (40 + 120 * d) * random.range(0.8, 1.2) * harshness;
                pen.lineTo(x + 60, y);
                pen.lineTo(pen.x + Math.max(20, height * 0.4), pen.y + height);
                pen.lineTo(pen.x + 220, pen.y);
                break;
            }

            case 'stairs':
                // Steps down, shaking the bike on each edge
                for (let step = random.int(3, 6); step > 0; step--) {
                    pen.lineTo(pen.x + random.range(50, 90), pen.y);
                    pen.lineTo(
                        pen.x + 8,
                        pen.y + (12 + 18 * t) * random.range(0.8, 1.2) * harshness,
                    );
                }
                pen.lineTo(pen.x + 120, pen.y);
                break;

            case 'bumps':
                // Sharp bumps, shaking the bike more and more
                for (let bump = random.int(3, 6); bump > 0; bump--) {
                    const width = random.range(40, 70);
                    const height = (6 + 16 * d) * random.range(0.8, 1.2) * harshness;
                    pen.lineTo(pen.x + width / 2, y - height);
                    pen.lineTo(pen.x + width / 2, y);
                    pen.lineTo(pen.x + random.range(20, 60), y);
                }
                break;

            case 'islands':
                // Platforms with gaps between them, to cross with enough speed
                pen.lineTo(x + 120, y);
                for (let island = random.int(2, 4); island > 0; island--) {
                    const gap = (40 + 70 * t) * random.range(0.8, 1.2) * gapScale;
                    pen.gapTo(pen.x + gap, pen.y + random.range(0, 25));
                    pen.lineTo(pen.x + random.range(90, 150), pen.y);
                }
                pen.lineTo(pen.x + 60, pen.y);
                break;

            case 'tunnel': {
                // A ceiling over the ground: the head of the rider must not touch it
                const height = 130 - 15 * t;
                const length = random.range(300, 500);
                pen.lineTo(x + 60, y);
                // Funnel at the entrance, guiding the bikes coming slightly high
                pen.addCeiling([
                    [pen.x - 50, pen.y - height - 60],
                    [pen.x, pen.y - height],
                    [pen.x + length, pen.y - height],
                    [pen.x + length + 50, pen.y - height - 60],
                ]);
                const end = pen.x + length;
                while (pen.x < end - 60) {
                    const width = random.range(50, 90);
                    pen.lineTo(pen.x + width / 2, y - (4 + 8 * t) * random.next());
                    pen.lineTo(pen.x + width / 2, y);
                }
                pen.lineTo(end + 60, y);
                break;
            }

            case 'ceiling': {
                // Bombs over a flat ground, lower and lower: no jumping there
                const height = 100 - 10 * Math.min(1, (d - 0.45) * 2);
                pen.lineTo(x + 100, y);
                for (let bomb = 0; bomb < 4; bomb++) {
                    pen.addItem('bomb', pen.x + 30 + 60 * bomb, y - height);
                }
                pen.lineTo(pen.x + 260, y);
                break;
            }

            case 'boostClimb': {
                // A steep climb, with boosts along it pushing the bike up
                const length = random.range(200, 300);
                const height = length * random.range(0.6, 0.85);
                const angle = (Math.atan2(height, length) * 180) / Math.PI;
                const boosts = Math.floor(length / 60);
                for (let boost = 1; boost <= boosts; boost++) {
                    const k = boost / (boosts + 1);
                    pen.addItem('boost', x + length * k, y - height * k - 12, 270 - angle);
                }
                pen.lineTo(x + length, y - height);
                pen.lineTo(pen.x + 100, pen.y);
                break;
            }

            case 'launchGap': {
                // A launcher on the run-up throwing the bike over a wide gap
                pen.lineTo(x + 160, y);
                pen.addItem('launcher', x + 110, y - 10, 235);
                const gap = (180 + 140 * t) * random.range(0.85, 1.15) * gapScale;
                pen.gapTo(pen.x + gap, pen.y + 40);
                TerrainGenerator.curve(pen, 220, 70, (k) => k * (2 - k));
                pen.lineTo(pen.x + 120, pen.y);
                break;
            }

            case 'mudPit': {
                // Mud slowing the bike down before a rise, to cross with speed
                pen.lineTo(x + 40, y);
                const length = random.range(150, 250);
                for (let mud = 0; mud * 30 < length; mud++) {
                    pen.addItem('mud', pen.x + 15 + 30 * mud, y - 8);
                }
                pen.lineTo(pen.x + length, y);
                TerrainGenerator.curve(pen, 160, -(30 + 30 * t), ease);
                pen.lineTo(pen.x + 80, pen.y);
                break;
            }

            case 'slowDrop': {
                // A slow motion before a big drop, to land it carefully
                const height = (100 + 100 * t) * random.range(0.8, 1.2);
                pen.lineTo(x + 80, y);
                pen.addItem('slowMo', pen.x - 20, y - 20);
                pen.lineTo(pen.x + Math.max(30, height * 0.45), pen.y + height);
                pen.lineTo(pen.x + 220, pen.y);
                break;
            }
        }
    }

    /**
     * Draws a curve from the position of the pen, sampled every 20 units or so.
     *
     * @param length - Horizontal length of the curve.
     * @param height - Height change of the curve, negative going up.
     * @param shape - Height at a part of the length, from 0 at the start to 1 at the end, both
     * between 0 and 1.
     */
    private static curve(
        pen: GroundPen,
        length: number,
        height: number,
        shape: (k: number) => number,
    ): void {
        const [x, y] = [pen.x, pen.y];
        const steps = Math.max(1, Math.ceil(length / 20));
        for (let step = 1; step <= steps; step++) {
            const k = step / steps;
            pen.lineTo(x + length * k, y + height * shape(k));
        }
    }
}
