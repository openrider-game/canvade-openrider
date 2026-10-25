/**
 * Settings of the endurance mode, in world units (y pointing down) unless told otherwise.
 *
 * The bikes are about 42 units long between their wheels, about one meter.
 */
export const UNITS_PER_METER = 40,
    /** Length of a generated section of the track, the unit of its generation and loading. */
    SECTION_LENGTH = 1200,
    /** Flat ground at the start, before the first obstacles. */
    START_RUNWAY = 600,
    /** Height of the ground under the start position, as on the default track. */
    GROUND_OFFSET = 50,
    /**
     * Distance over which the difficulty grows from 0 to 1, about 750 m. It keeps growing after,
     * up to {@link MAX_DIFFICULTY}, where staying alive is a matter of luck and skill.
     */
    DIFFICULTY_DISTANCE = 30000,
    MAX_DIFFICULTY = 2,
    /** Sections kept on the track around the bike: behind it, and ahead of it. */
    LOADED_BEHIND = 2000,
    LOADED_AHEAD = 5000,
    /**
     * How far a bike may ride back from the furthest point it reached before its run ends: the
     * sections further behind may be off the track, kept on it for slower ghosts only. Shorter
     * than {@link LOADED_BEHIND}, so that a bike never touches the edge of the loaded sections.
     */
    BACK_LIMIT = 1600,
    /** Depth under the lowest ground around the bike past which a falling bike crashes. */
    FALL_DEPTH = 400,
    /** Spacing of the distance posts drawn along the track, every 100 m. */
    POST_SPACING = 100 * UNITS_PER_METER;
