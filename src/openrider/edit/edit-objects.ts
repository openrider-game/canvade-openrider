import { Vector } from 'canvade';
import { ITEM_MAP } from '../item/item.constants';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { LinkedItem } from '../item/linked-item';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import type { ObjectData } from './track-edit';

/**
 * The objects as the edits describe them (see `TrackEditor`): each one by its code, a linked item
 * by its group, and its rank in the grid cells.
 */

/** The object an edit adds or removes for an object of the track: its group if linked. */
export function unitOf(object: TrackObject): TrackObject {
    return object instanceof LinkedItem && object.group ? object.group : object;
}

/**
 * Code of an object: its points for a line, else its item code, without marking it as exported
 * (see `TrackObject.recorded`).
 */
export function codeOf(object: TrackObject): string {
    if (object.kind !== 'item') {
        return `${object.pos.toString()} ${object.endPos.toString()}`;
    }
    const marked = [object, ...(object instanceof LinkedItemGroup ? object.instances : [])];
    const recorded = marked.map((part) => part.recorded);
    const code = object.toString();
    marked.forEach((part, i) => (part.recorded = recorded[i]));
    return code;
}

/** A new object from its kind and code, not on the track; undefined for an unknown item. */
export function objectFromCode(
    kind: ObjectData['kind'],
    code: string,
    track: Track,
): TrackObject | undefined {
    const values = code.split(' ');
    if (kind === 'item') {
        return ITEM_MAP.get(values[0])?.createInstance(values, track);
    }
    const [x1, y1, x2, y2] = values.map((value) => parseInt(value, 32));
    const LineClass = kind === 'solid' ? SolidLine : SceneryLine;
    return new LineClass(new Vector(x1, y1), new Vector(x2, y2), track);
}

/** Rank of an object in the grid cells: of its items for a group of linked items. */
export function orderOf(object: TrackObject): number | null {
    return object instanceof LinkedItemGroup ? (object.instances[0]?.order ?? null) : object.order;
}

/** Puts an object at its rank in the grid cells, see `TrackObject.order`. */
export function rankObject(object: TrackObject, order: number): void {
    const parts = object instanceof LinkedItemGroup ? object.instances : [object];
    if (parts.every((part) => part.order === order)) {
        return;
    }
    // Taken off and put back, at its rank
    const onTrack = parts[0]?.onTrack ?? false;
    object.removeFromTrack();
    parts.forEach((part) => (part.order = order));
    if (onTrack) {
        object.addToTrack();
    }
}
