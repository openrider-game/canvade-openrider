import { Vector } from 'canvade';
import { ITEM_MAP } from '../item/item.constants';
import { LinkedItemGroup } from '../item/linked-item-group';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import type { TrackObject, TrackObjectKind } from '../item/track-object';
import type { Track } from '../track/track';
import { ObjectTransform } from './object-transform';
import { unitOf } from './edit-objects';

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
 * As text, e.g. in the clipboard of the browser or in a template, the objects are written as the
 * first three sections of a track code: the solid lines, the scenery lines and the items, each
 * line as `x1 y1 x2 y2`. Reading text reads those sections of any track code, a whole track
 * pasted giving its lines, made of polylines, and items.
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

    /** Objects as text: the solid lines, the scenery lines and the items of a track code. */
    public static toText(objects: readonly ClipObject[]): string {
        const section = (kind: TrackObjectKind) =>
            objects
                .filter((object) => object.kind === kind)
                .map((object) => object.code)
                .join(',');
        return `${section('solid')}#${section('scenery')}#${section('item')}`;
    }

    /**
     * Reads objects from text, e.g. pasted: the first three sections of a track code, each line
     * of a polyline apart.
     *
     * @returns The objects, null when the text is not a track code, e.g. any other text copied.
     */
    public static fromText(text: string): ClipObject[] | null {
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
     * Objects created from their codes, not placed on the track: e.g. to draw objects being
     * pasted where they would be, and to move their codes there (see `ObjectTransform.code`).
     * Codes that cannot be read are left out.
     */
    public static instantiate(objects: readonly ClipObject[], track: Track): TrackObject[] {
        return objects.flatMap(({ kind, code }): TrackObject[] => {
            const values = code.split(' ');
            try {
                if (kind !== 'item') {
                    const [x1, y1, x2, y2] = values.map((value) => parseInt(value, 32));
                    const LineClass = kind === 'solid' ? SolidLine : SceneryLine;
                    return [new LineClass(new Vector(x1, y1), new Vector(x2, y2), track)];
                }
                const item = ITEM_MAP.get(values[0])?.createInstance(values, track);
                return item ? [item] : [];
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
