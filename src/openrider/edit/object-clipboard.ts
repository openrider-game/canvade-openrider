import { Vector } from 'canvade';
import { DEFAULT_BIKE } from '../bike/bike.constants';
import { ITEM_MAP } from '../item/item.constants';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject, TrackObjectKind } from '../item/track-object';
import {
    addScenery,
    emptyLayer,
    formatItem,
    parseItem,
    type TrackDocument,
} from '../parser/track-document';
import { TrackFormat } from '../parser/track-format';
import type { Track } from '../track/track';
import { ObjectTransform } from './object-transform';
import { objectFromCode, unitOf } from './edit-objects';

/** Object copied, as the edits describe it, without an id nor a layer. */
export interface ClipObject {
    kind: TrackObjectKind;
    /** Code of the object, relative to the center of what was copied. */
    code: string;
}

/** A base 32 integer, as the coordinates and settings of the track codes. */
const BASE32_INTEGER = /^-?[0-9a-v]+$/;

/**
 * Objects copied, pasted or saved as a template: their codes relative to the center of what was
 * copied, so that they are pasted around the pointer.
 *
 * As text, e.g. in the clipboard of the browser or in a template, the objects are written as a
 * track code (see `TrackFormat`), the base 64 text of a track file holding them around its
 * origin: each line as a polyline of its own, the scenery lines by color, then the items. Reading
 * text reads any track code or file, a whole track pasted giving its lines and items, and the
 * first three sections of the original track codes, as the templates were saved before: the solid
 * lines, the scenery lines and the items.
 */
export abstract class ObjectClipboard {
    /** Objects copied or cut last, pasted by the select tool. */
    public static content: ClipObject[] = [];

    /**
     * Copies objects of a track, relative to the center of their area: the groups of linked items
     * only when every item of the group is copied, as a lone item of a group cannot be pasted.
     *
     * @param objects - Objects of the track, the items of a linked group by themselves.
     */
    public static copy(objects: readonly TrackObject[]): ClipObject[] {
        const parts = new Map<TrackObject, Set<TrackObject>>();
        for (const object of objects) {
            const unit = unitOf(object);
            parts.set(unit, (parts.get(unit) ?? new Set()).add(object));
        }

        const units = [...parts].filter(
            ([unit, copied]) =>
                !(unit instanceof LinkedItemGroup) ||
                unit.instances.every((instance) => copied.has(instance)),
        );
        const center = ObjectClipboard.center(objects);
        const toCenter = ObjectTransform.move(new Vector(-center.x, -center.y));
        return units.map(([unit]) => ({ kind: unit.kind, code: toCenter.code(unit) }));
    }

    /** Center of the area of objects, in whole world units. */
    public static center(objects: readonly TrackObject[]): Vector {
        if (objects.length === 0) {
            return new Vector();
        }
        const xs = objects.flatMap((object) => [object.pos.x, object.endPos.x]);
        const ys = objects.flatMap((object) => [object.pos.y, object.endPos.y]);
        return new Vector(
            Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
            Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
        );
    }

    /** Objects as text: a track code holding them, see the class comment. */
    public static toText(objects: readonly ClipObject[]): string {
        return TrackFormat.toTrackCode(ObjectClipboard.toDocument(objects));
    }

    /**
     * A track holding objects in its main layer, around its origin: each line as a polyline of
     * its own, the scenery lines in the group of their color.
     */
    private static toDocument(objects: readonly ClipObject[]): TrackDocument {
        const layer = emptyLayer('main', 'Main');
        for (const { kind, code } of objects) {
            if (kind === 'item') {
                const item = parseItem(code);
                if (item) {
                    layer.items.push(item);
                }
                continue;
            }
            const [x1, y1, x2, y2, color = 0] = code.split(' ').map((value) => parseInt(value, 32));
            if (kind === 'solid') {
                layer.solid.push([x1, y1, x2, y2]);
            } else {
                addScenery(layer.scenery, color, [[x1, y1, x2, y2]]);
            }
        }
        return { layers: [layer], bike: DEFAULT_BIKE.bikeName, origin: { x: 0, y: 0 } };
    }

    /**
     * Reads objects from text, e.g. pasted: a track code or file of any layers, or the first
     * three sections of an original track code, each line of a polyline apart.
     *
     * @returns The objects, null when the text is not a track code, e.g. any other text copied,
     * or holds items unknown to the game.
     */
    public static fromText(text: string): ClipObject[] | null {
        const bytes = TrackFormat.fromText(text.trim());
        if (bytes && TrackFormat.isBinary(bytes)) {
            try {
                return ObjectClipboard.fromDocument(TrackFormat.decode(bytes));
            } catch {
                return null;
            }
        }

        const sections = text.trim().split('#');
        if (sections.length < 3) {
            return null;
        }

        const objects: ClipObject[] = [];
        const kinds: TrackObjectKind[] = ['solid', 'scenery'];
        for (const [index, kind] of kinds.entries()) {
            for (const polyline of ObjectClipboard.entries(sections[index])) {
                const points = polyline.split(' ');
                if (points.length < 4 || points.length % 2 || !points.every(isInteger)) {
                    return null;
                }
                for (let i = 0; i + 3 < points.length; i += 2) {
                    objects.push({ kind, code: points.slice(i, i + 4).join(' ') });
                }
            }
        }
        for (const item of ObjectClipboard.entries(sections[2])) {
            const [letter, ...values] = item.split(' ');
            if (!ITEM_MAP.has(letter) || values.length < 2 || !values.every(isInteger)) {
                return null;
            }
            objects.push({ kind: 'item', code: item });
        }
        return objects;
    }

    /**
     * Objects of every layer of a track, each line of a polyline apart, the scenery lines with
     * their color; null when an item is unknown to the game.
     */
    private static fromDocument(document: TrackDocument): ClipObject[] | null {
        const objects: ClipObject[] = [];
        const lines = (kind: TrackObjectKind, polyline: number[], color = 0) => {
            for (let i = 0; i + 3 < polyline.length; i += 2) {
                const values = polyline.slice(i, i + 4);
                // The color of a scenery line after its points, unless 0, as in the edits
                if (color) {
                    values.push(color);
                }
                objects.push({ kind, code: values.map((value) => value.toString(32)).join(' ') });
            }
        };
        for (const layer of document.layers) {
            layer.solid.forEach((polyline) => lines('solid', polyline));
            layer.scenery.forEach(({ color, polylines }) =>
                polylines.forEach((polyline) => lines('scenery', polyline, color)),
            );
        }
        for (const layer of document.layers) {
            for (const item of layer.items) {
                if (!ITEM_MAP.has(item.code)) {
                    return null;
                }
                objects.push({ kind: 'item', code: formatItem(item) });
            }
        }
        return objects;
    }

    /**
     * Objects created from their codes, not placed on the track: e.g. to draw objects being
     * pasted where they would be, and to move their codes there (see `ObjectTransform.code`).
     * Codes that cannot be read are left out.
     */
    public static instantiate(objects: readonly ClipObject[], track: Track): TrackObject[] {
        return objects.flatMap(({ kind, code }): TrackObject[] => {
            try {
                const object = objectFromCode(kind, code, track);
                return object ? [object] : [];
            } catch {
                return [];
            }
        });
    }

    /** Entries of a section of a track code, separated with commas. */
    private static entries(section: string | undefined): string[] {
        return (section ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
}

function isInteger(value: string): boolean {
    return BASE32_INTEGER.test(value);
}
