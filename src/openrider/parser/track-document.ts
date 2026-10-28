import type { TrackLayerType } from '../track/track-layer';

/** Points of connected lines, flattened as `[x1, y1, x2, y2, ...]`: integers, in world units. */
export type Polyline = number[];

/** Scenery polylines of a color, see `SCENERY_COLORS`. */
export interface SceneryGroup {
    /** Index of the color in `SCENERY_COLORS`, 0 for the grey of the original scenery. */
    color: number;
    polylines: Polyline[];
}

/** An item as stored: its letter, then its integer values, starting with its position. */
export interface ItemEntity {
    /** Letter of the item class, see `ITEM_MAP`. */
    code: string;
    /** `[x, y, ...]`, followed by the values of the item class, e.g. a rotation. */
    values: number[];
}

/** Content of a layer. */
export interface LayerDocument {
    name: string;
    type: TrackLayerType;
    /** Whether the editor displays the layer. */
    visible: boolean;
    solid: Polyline[];
    /** Scenery lines, by color, each color at most once. */
    scenery: SceneryGroup[];
    /** Items, in the order the track adds them; always empty for foreground layers. */
    items: ItemEntity[];
}

/** Content of a track, layer by layer, as `TrackFormat` reads and writes it. */
export interface TrackDocument {
    /** Layers from the bottom one to the top one, with at least one main layer. */
    layers: LayerDocument[];
    /** Name of the bike. */
    bike: string;
    /** Start position, in world units. */
    origin: { x: number; y: number };
}

/**
 * Writes an item in the text format of the edits (see `TrackEditor`): its letter, then its
 * values in base 32, separated by spaces.
 */
export function formatItem(entity: ItemEntity): string {
    return [entity.code, ...entity.values.map((value) => value.toString(32))].join(' ');
}

/**
 * Reads an item in the text format of the edits and of the original track codes.
 *
 * @returns The item, or null without a position: values that are no base 32 integers are read
 * as 0, as the command blocks always did.
 */
export function parseItem(code: string): ItemEntity | null {
    const [letter, ...values] = code.split(' ');
    if (!letter || values.length < 2) {
        return null;
    }
    const numbers = values.map((value) => parseInt(value, 32));
    if (!Number.isFinite(numbers[0]) || !Number.isFinite(numbers[1])) {
        return null;
    }
    return { code: letter, values: numbers.map((value) => value || 0) };
}

/** A layer without content. */
export function emptyLayer(type: TrackLayerType, name: string): LayerDocument {
    return { name, type, visible: true, solid: [], scenery: [], items: [] };
}

/**
 * Adds scenery polylines to the groups of a layer, in the group of their color, created after
 * the others if missing.
 */
export function addScenery(groups: SceneryGroup[], color: number, polylines: Polyline[]): void {
    const group = groups.find((existing) => existing.color === color);
    if (group) {
        // Not spread: a large track holds more polylines than a call takes arguments
        for (const polyline of polylines) {
            group.polylines.push(polyline);
        }
    } else {
        groups.push({ color, polylines: [...polylines] });
    }
}
