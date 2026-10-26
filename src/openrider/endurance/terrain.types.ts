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
    /** Difficulty at the start of the section, from 0, see `TerrainGenerator.difficultyAt`. */
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
