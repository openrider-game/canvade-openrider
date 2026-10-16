/** Modes of a track: editing it, or racing it. */
export const TRACK_MODE_EDITING = 'TRACK_MODE_EDITING',
    TRACK_MODE_RACING = 'TRACK_MODE_RACING',
    /** Track code of a new track: a single horizontal line under the start position. */
    TRACK_DEFAULT = '-18 1i 18 1i',
    /**
     * Bounds of the line lengths, in world units: lines outside of them are kept in the layer
     * totals but never stored in the grid cells, so they neither collide nor render.
     */
    MIN_LINE_LENGTH = 2,
    MAX_LINE_LENGTH = 100000,
    /** Zoom factors, as canvas pixels per world unit. */
    DEFAULT_ZOOM = 0.6,
    MIN_ZOOM = 0.2,
    MAX_ZOOM = 4,
    ZOOM_STEP = 0.2,
    /** Speed at which the camera catches up with the focal point. */
    CAMERA_FOLLOW_FACTOR = 1 / 200;

/** Mode of a track. */
export type TrackMode = typeof TRACK_MODE_EDITING | typeof TRACK_MODE_RACING;
