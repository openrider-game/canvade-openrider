import { EDIT_LIMITS } from '../live/protocol';

/**
 * Most objects a selection holds, moved, rotated, copied or deleted at once, and the most objects
 * the area of a command block acts on when placed.
 *
 * Moving a selection is a single edit removing the objects and adding them moved: twice the
 * objects, within the objects of an edit the live sessions take (see `EDIT_LIMITS`).
 */
export const MAX_SELECTED_OBJECTS = Math.min(5000, Math.floor(EDIT_LIMITS.objects / 2));
