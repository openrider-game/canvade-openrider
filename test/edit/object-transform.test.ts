import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ObjectTransform } from '../../src/openrider/edit/object-transform';
import { TrackEditor } from '../../src/openrider/edit/track-editor';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import type { TrackObject } from '../../src/openrider/item/track-object';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/**
 * A line from (0, 0) to (100, 0); a target at (10, 0), a boost at (20, 0) pointing down, a
 * teleporter from (30, 0) to (500, 0), a command block at (40, 0) hiding the area (200, -50) to
 * (300, 50).
 */
const TRACK = '0 0 34 0##T a 0,B k 0 -5k,W u 0 fk 0,A 18 0 2 68 -1i 9c 1i,#0 -a a -a##BMX#0 0';

let track: Track;

beforeEach(() => {
    stubBrowser();
    track = parseTrack(TRACK);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const objects = () => [
    ...track.layers.main[0].grid.totalSolidLines.values(),
    ...track.layers.main[0].grid.totalObjects.values(),
];
const byCode = (letter: string) =>
    objects().find((object) => TrackEditor.codeOf(object).startsWith(`${letter} `))!;
const line = () => track.layers.main[0].grid.totalSolidLines.values().next().value!;

describe('Object transforms', () => {
    test('move a line, turning it around the pivot, its points rounded', () => {
        // A quarter turn clockwise around (0, 0), then 10 units right
        const transform = new ObjectTransform(new Vector(0, 0), Math.PI / 2, new Vector(10, 0));

        expect(transform.code(line())).toBe('a 0 a 34');
    });

    test('move the items, turning the directional ones by the angle', () => {
        const transform = new ObjectTransform(new Vector(0, 0), Math.PI, new Vector());

        expect(transform.code(byCode('T'))).toBe('T -a 0');
        // Pointing down, turned half a turn: pointing up
        expect(transform.code(byCode('B'))).toBe(`B -k 0 ${(0).toString(32)}`);
    });

    test('move a command block, leaving the area it acts on', () => {
        const block = byCode('A');

        expect(ObjectTransform.move(new Vector(32, 32)).code(block)).toBe('A 28 10 2 68 -1i 9c 1i');
    });

    test('move only the items of a linked group given, the others staying', () => {
        const [entry, exit] = objects().filter((object) => object instanceof LinkedItem);
        const group = TrackEditor.unitOf(entry);
        const move = ObjectTransform.move(new Vector(0, 64));

        expect(move.code(group, new Set([entry]))).toBe('W u 20 fk 0');
        expect(move.code(group, new Set([entry, exit]))).toBe('W u 20 fk 20');
    });

    test('replace objects in a single edit, undone and redone at once', () => {
        const moved: TrackObject[] = [line(), byCode('T')];
        const move = ObjectTransform.move(new Vector(64, 0));
        const before = objects()
            .map((object) => TrackEditor.codeOf(object))
            .sort();

        const added = track.editor.replace(
            moved.map((object) => ({ object, code: move.code(object) })),
        );

        expect(added.map((object) => TrackEditor.codeOf(object))).toEqual(['20 0 54 0', 'T 2a 0']);
        expect(moved.every((object) => !object.onTrack)).toBe(true);
        track.history.undo();
        expect(
            objects()
                .map((object) => TrackEditor.codeOf(object))
                .sort(),
        ).toEqual(before);
        track.history.redo();
        expect(objects().map((object) => TrackEditor.codeOf(object))).toContain('T 2a 0');
    });
});
