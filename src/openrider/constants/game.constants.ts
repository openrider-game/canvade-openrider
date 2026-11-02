/** Physics ticks per second, the unit of the track time and of the ghost recordings. */
export const GAME_UPS = 50,
    /** Duration of one physics tick in milliseconds, to convert the track time. */
    FRAME_DURATION = 1000 / GAME_UPS;

/**
 * Size of the thumbnails uploaded with the tracks and the templates, in pixels, as the website
 * checks it.
 */
export const THUMBNAIL_WIDTH = 500,
    THUMBNAIL_HEIGHT = 300;
