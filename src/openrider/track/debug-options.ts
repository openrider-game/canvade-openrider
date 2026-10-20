/** Overlays of the debug mode, each one shown or hidden from the debug panel. */
export interface DebugOptions {
    /** Render cache and physics grids. */
    grids: boolean;
    /** Physics cells checked around each point of the bikes, and their hitboxes. */
    collisions: boolean;
    /** Ids of the items. */
    objects: boolean;
    /** Points, springs and velocities of the bikes. */
    bikes: boolean;
    /**
     * State of the cached image of each render cell: up to date, stale, of another zoom level or
     * missing, and the number of lines of the cells rendered by the workers.
     */
    cells: boolean;
    /** Frame rate, time, view, track and renderer figures, player inputs and status effects. */
    stats: boolean;
}

/** Labels of the overlays in the debug panel, in display order. */
export const DEBUG_OPTION_LABELS: Record<keyof DebugOptions, string> = {
    grids: 'Grids',
    collisions: 'Collisions',
    objects: 'Item ids',
    bikes: 'Bike physics',
    cells: 'Cache cells',
    stats: 'Stats',
};

/** Overlays shown when the debug mode is first enabled: those of the original game, and stats. */
export function defaultDebugOptions(): DebugOptions {
    return {
        grids: true,
        collisions: true,
        objects: true,
        bikes: false,
        cells: false,
        stats: true,
    };
}
