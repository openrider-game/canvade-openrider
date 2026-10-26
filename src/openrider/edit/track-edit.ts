import type { TrackObjectKind } from '../item/track-object';
import type { TrackLayerType } from '../track/track-layer';

/**
 * Object of the track in an edit: a line, an item, or a group of linked items, which are added
 * and removed together. Described as in the track codes, so that an edit is plain data: undone
 * and redone, and later sent to the other editors of a track.
 */
export interface ObjectData {
    /** Id of the object, the same for every editor of the track (see `TrackEditor`). */
    uid: string;
    /** Id of its layer. */
    layer: string;
    kind: TrackObjectKind;
    /**
     * Code of the object: the base 32 points of a line, `x1 y1 x2 y2`, or the item code of an
     * item, e.g. `T x y`.
     */
    code: string;
}

/** Layer of the track in an edit. */
export interface LayerData {
    /** Id of the layer, the same for every editor of the track. */
    uid: string;
    type: TrackLayerType;
    name: string;
}

/**
 * Change of the track, applied by the `TrackEditor`: the history keeps the edits made, undoing
 * one applies its inverse (see {@link invertEdit}).
 *
 * Applying an edit is idempotent: the objects already on the track are not added again, nor the
 * missing ones removed, and an edit of a missing layer does nothing. An edit can then be undone
 * whatever happened since, e.g. the other editors of the track removing the same objects.
 */
export type TrackEdit =
    | { type: 'add'; objects: ObjectData[] }
    | { type: 'remove'; objects: ObjectData[] }
    /** A layer added at an index of the stack, from the bottom. */
    | { type: 'addLayer'; layer: LayerData; index: number }
    /** A layer removed with its objects, from an index of the stack. */
    | { type: 'removeLayer'; layer: LayerData; index: number; objects: ObjectData[] }
    | { type: 'moveLayer'; layer: string; from: number; to: number }
    | { type: 'renameLayer'; layer: string; from: string; to: string }
    /** Edits made together, e.g. the lines of a brush stroke, undone together. */
    | { type: 'group'; edits: TrackEdit[] };

/** Edit undoing an edit. */
export function invertEdit(edit: TrackEdit): TrackEdit {
    switch (edit.type) {
        case 'add':
            return { type: 'remove', objects: edit.objects };
        case 'remove':
            return { type: 'add', objects: edit.objects };
        case 'addLayer':
            return { type: 'removeLayer', layer: edit.layer, index: edit.index, objects: [] };
        case 'removeLayer':
            // The layer, then its objects
            return {
                type: 'group',
                edits: [
                    { type: 'addLayer', layer: edit.layer, index: edit.index },
                    { type: 'add', objects: edit.objects },
                ],
            };
        case 'moveLayer':
            return { type: 'moveLayer', layer: edit.layer, from: edit.to, to: edit.from };
        case 'renameLayer':
            return { type: 'renameLayer', layer: edit.layer, from: edit.to, to: edit.from };
        case 'group':
            return { type: 'group', edits: [...edit.edits].reverse().map(invertEdit) };
    }
}
