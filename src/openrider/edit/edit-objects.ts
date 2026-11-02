import { Vector } from 'canvade';
import { ITEM_MAP } from '../item/item.constants';
import type { Line } from '../item/line/line';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { LinkedItem } from '../item/linked-item';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject } from '../item/track-object';
import { parseItem } from '../parser/track-document';
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
 * Code of an object, without marking it as exported (see `TrackObject.recorded`): for a line,
 * its two base 32 points, then its color unless 0 (see `Line.color`); else its item code.
 */
export function codeOf(object: TrackObject): string {
    if (object.kind !== 'item') {
        return lineCode(`${object.pos.toString()} ${object.endPos.toString()}`, object as Line);
    }
    const marked = [object, ...(object instanceof LinkedItemGroup ? object.instances : [])];
    const recorded = marked.map((part) => part.recorded);
    const code = object.toString();
    marked.forEach((part, i) => (part.recorded = recorded[i]));
    return code;
}

/** Code of a line from the code of its points: followed by its color, unless 0. */
export function lineCode(points: string, line: Line): string {
    return line.color ? `${points} ${line.color.toString(32)}` : points;
}

/**
 * A new object from its kind and code, not on the track; undefined for an unknown item, or an
 * item without position.
 */
export function objectFromCode(
    kind: ObjectData['kind'],
    code: string,
    track: Track,
): TrackObject | undefined {
    if (kind === 'item') {
        const entity = parseItem(code);
        return entity ? ITEM_MAP.get(entity.code)?.createInstance(entity.values, track) : undefined;
    }
    const [x1, y1, x2, y2, color] = code.split(' ').map((value) => parseInt(value, 32));
    const LineClass = kind === 'solid' ? SolidLine : SceneryLine;
    const line = new LineClass(new Vector(x1, y1), new Vector(x2, y2), track);
    // Solid lines have no color
    if (kind === 'scenery' && color > 0) {
        line.color = color;
    }
    return line;
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
