import { CONTROL_NAMES, ControlName } from '../bike/runner/runner-controls';
import type { LayerData, ObjectData, TrackEdit, TrackSnapshot } from '../edit/track-edit';
import { type ClientMessage, EDIT_LIMITS, MAX_EVENTS_PER_MESSAGE } from './protocol';
import type { RunEvent } from './run-events';

/**
 * Reading of the messages of the live sessions (see `protocol.ts`) from untrusted JSON, by the
 * session server: a message is read only when every part of it is valid and within the limits,
 * null otherwise.
 */

/**
 * Name of a bike, as in the track codes (`BIKE_MAP`, not imported here to keep the bikes out of
 * the session server): a remote runner rides an unknown one with the default bike.
 */
const BIKE_NAME = /^[A-Za-z]{1,8}$/;

function isTime(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2 ** 31;
}

/** Reads the events of a run from untrusted JSON, null when one of them is invalid. */
export function parseRunEvents(value: unknown): RunEvent[] | null {
    if (!Array.isArray(value) || value.length > MAX_EVENTS_PER_MESSAGE) {
        return null;
    }
    const events: RunEvent[] = [];
    for (const item of value as Array<Record<string, unknown> | null>) {
        const time = item?.time;
        if (!isTime(time)) {
            return null;
        }
        if (item?.type === 'start') {
            const { checkpoints, bike } = item;
            if (!isTime(checkpoints) || typeof bike !== 'string' || !BIKE_NAME.test(bike)) {
                return null;
            }
            events.push({ type: 'start', time, checkpoints, bike });
        } else if (item?.type === 'toggle') {
            const control = item.control as ControlName;
            if (!CONTROL_NAMES.includes(control)) {
                return null;
            }
            events.push({ type: 'toggle', time, control });
        } else if (item?.type === 'progress') {
            events.push({ type: 'progress', time });
        } else if (item?.type === 'retire') {
            events.push({ type: 'retire', time });
        } else {
            return null;
        }
    }
    return events;
}

const KINDS = ['solid', 'scenery', 'item'];

function isText(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isIndex(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000;
}

/** Base 32 `x y` position. */
function isPoint(value: unknown): value is string {
    return typeof value === 'string' && /^-?[0-9a-v]{1,8} -?[0-9a-v]{1,8}$/.test(value);
}

function parseObjects(value: unknown, max: number): ObjectData[] | null {
    if (!Array.isArray(value) || value.length > max) {
        return null;
    }
    const objects: ObjectData[] = [];
    for (const item of value as Array<Record<string, unknown> | null>) {
        const { uid, layer, kind, code } = item ?? {};
        if (
            !isText(uid, EDIT_LIMITS.uid) ||
            !isText(layer, EDIT_LIMITS.uid) ||
            !KINDS.includes(kind as string) ||
            !isText(code, EDIT_LIMITS.code)
        ) {
            return null;
        }
        objects.push({ uid, layer, kind: kind as ObjectData['kind'], code });
    }
    return objects;
}

function parseLayer(value: unknown): LayerData | null {
    const { uid, type, name } = (value ?? {}) as Record<string, unknown>;
    return isText(uid, EDIT_LIMITS.uid) &&
        (type === 'main' || type === 'foreground') &&
        isText(name, EDIT_LIMITS.name)
        ? { uid, type, name }
        : null;
}

/** Reads an edit from untrusted JSON, null when it is invalid. */
export function parseTrackEdit(value: unknown, depth = 0): TrackEdit | null {
    const edit = (value ?? {}) as Record<string, unknown>;
    switch (edit.type) {
        case 'add':
        case 'remove': {
            const objects = parseObjects(edit.objects, EDIT_LIMITS.objects);
            return objects && { type: edit.type, objects };
        }
        case 'addLayer': {
            const layer = parseLayer(edit.layer);
            return layer && isIndex(edit.index)
                ? { type: 'addLayer', layer, index: edit.index }
                : null;
        }
        case 'removeLayer': {
            const layer = parseLayer(edit.layer);
            const objects = parseObjects(edit.objects, EDIT_LIMITS.objects);
            return layer && objects && isIndex(edit.index)
                ? { type: 'removeLayer', layer, index: edit.index, objects }
                : null;
        }
        case 'moveLayer':
            return isText(edit.layer, EDIT_LIMITS.uid) && isIndex(edit.from) && isIndex(edit.to)
                ? { type: 'moveLayer', layer: edit.layer, from: edit.from, to: edit.to }
                : null;
        case 'renameLayer':
            return isText(edit.layer, EDIT_LIMITS.uid) &&
                isText(edit.from, EDIT_LIMITS.name) &&
                isText(edit.to, EDIT_LIMITS.name)
                ? { type: 'renameLayer', layer: edit.layer, from: edit.from, to: edit.to }
                : null;
        case 'origin':
            return isPoint(edit.from) && isPoint(edit.to)
                ? { type: 'origin', from: edit.from, to: edit.to }
                : null;
        case 'group': {
            if (depth >= EDIT_LIMITS.depth || !Array.isArray(edit.edits)) {
                return null;
            }
            const edits = (edit.edits as unknown[]).map((part) => parseTrackEdit(part, depth + 1));
            return edits.every((part) => part !== null)
                ? { type: 'group', edits: edits as TrackEdit[] }
                : null;
        }
        default:
            return null;
    }
}

/** Reads a whole track from untrusted JSON, null when it is invalid. */
export function parseSnapshot(value: unknown): TrackSnapshot | null {
    const { layers, objects, origin } = (value ?? {}) as Record<string, unknown>;
    if (!Array.isArray(layers) || layers.length === 0 || layers.length > EDIT_LIMITS.layers) {
        return null;
    }
    const layerData = layers.map(parseLayer);
    const objectData = parseObjects(objects, EDIT_LIMITS.snapshotObjects);
    return layerData.every((layer) => layer !== null) &&
        layerData.some((layer) => layer?.type === 'main') &&
        objectData &&
        isPoint(origin)
        ? { layers: layerData as LayerData[], objects: objectData, origin }
        : null;
}

/** Reads a message of a rider from untrusted JSON, null when it is invalid. */
export function parseClientMessage(json: string): ClientMessage | null {
    let message: Record<string, unknown> | null;
    try {
        message = JSON.parse(json) as Record<string, unknown> | null;
    } catch {
        return null;
    }

    switch (message?.type) {
        case 'run': {
            const events = parseRunEvents(message.events);
            return events && { type: 'run', events };
        }
        case 'finish': {
            const { ghostString, time } = message;
            return typeof ghostString === 'string' && isTime(time)
                ? { type: 'finish', ghostString, time }
                : null;
        }
        case 'resync':
            return typeof message.rider === 'string'
                ? { type: 'resync', rider: message.rider }
                : null;
        case 'edits': {
            if (!Array.isArray(message.edits) || message.edits.length > EDIT_LIMITS.edits) {
                return null;
            }
            const edits = (message.edits as unknown[]).map((edit) => parseTrackEdit(edit));
            return edits.every((edit) => edit !== null)
                ? { type: 'edits', edits: edits as TrackEdit[] }
                : null;
        }
        case 'snapshot': {
            const snapshot = parseSnapshot(message.snapshot);
            return snapshot && isTime(message.seq)
                ? { type: 'snapshot', seq: message.seq, snapshot }
                : null;
        }
        case 'cursor': {
            const pos = message.pos;
            if (pos === null) {
                return { type: 'cursor', pos: null };
            }
            return Array.isArray(pos) &&
                pos.length === 2 &&
                pos.every((value) => Number.isFinite(value) && Math.abs(value) < 1e9)
                ? { type: 'cursor', pos: [pos[0] as number, pos[1] as number] }
                : null;
        }
        default:
            return null;
    }
}
