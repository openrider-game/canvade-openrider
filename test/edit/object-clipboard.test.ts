import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ObjectClipboard } from '../../src/openrider/edit/object-clipboard';
import { codeOf } from '../../src/openrider/edit/edit-objects';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import type { TrackObject } from '../../src/openrider/item/track-object';
import { emptyLayer } from '../../src/openrider/parser/track-document';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/**
 * A line from (0, 0) to (100, 0); a target at (10, 0), a boost at (20, 0) pointing down, a
 * teleporter from (30, 0) to (500, 0), a command block at (40, 0) hiding the area (200, -50) to
 * (300, 50); and in the foreground layer, a line from (0, -10) to (10, -10), not copied.
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

/** The objects of the main layer, with a scenery line of a color added. */
function objects(): TrackObject[] {
    const layer = track.layers.main[0];
    const colored = new SceneryLine(new Vector(0, 20), new Vector(40, 20), track);
    colored.color = 5;
    colored.layer = layer;
    colored.addToTrack();
    return [
        ...layer.grid.totalSolidLines.values(),
        ...layer.grid.totalSceneryLines.values(),
        ...layer.grid.totalObjects.values(),
    ];
}

describe('Object clipboard', () => {
    test('writes the objects as a track file, read back as they were, colors included', () => {
        const copied = ObjectClipboard.copy(objects());
        const text = ObjectClipboard.toText(copied);

        // The base 64 text of a track code holding them
        expect(text.startsWith('T1I')).toBe(true);
        expect(TrackFormat.isEditorCode(text)).toBe(false);
        expect(TrackFormat.objectCount(text)).toBe(copied.length);
        const sorted = (clip: typeof copied) =>
            clip.map(({ kind, code }) => `${kind} ${code}`).sort();
        expect(sorted(ObjectClipboard.fromText(text)!)).toEqual(sorted(copied));

        // The scenery line keeps its color, pasted again
        const pasted = ObjectClipboard.instantiate(ObjectClipboard.fromText(text)!, track);
        const scenery = pasted.filter((object) => object.kind === 'scenery') as SceneryLine[];
        expect(scenery.map((line) => line.color)).toEqual([5]);
        expect(pasted.map(codeOf).sort()).toEqual(copied.map(({ code }) => code).sort());
    });

    test('reads the templates saved before the track files, and any track pasted', () => {
        // The first three sections of an original track code
        expect(ObjectClipboard.fromText('0 0 a 0##T 0 -a')).toEqual([
            { kind: 'solid', code: '0 0 a 0' },
            { kind: 'item', code: 'T 0 -a' },
        ]);

        // A whole track file, its foreground layer included, each line of a polyline apart
        const main = emptyLayer('main', 'Main');
        main.solid.push([0, 0, 10, 0, 20, 5]);
        main.items.push({ code: 'T', values: [3, 4] });
        const foreground = emptyLayer('foreground', 'Foreground');
        foreground.scenery.push({ color: 2, polylines: [[0, 0, 0, 10]] });
        const file = TrackFormat.toTrackCode({
            layers: [main, foreground],
            bike: 'BMX',
            origin: { x: 0, y: 0 },
        });
        expect(ObjectClipboard.fromText(file)).toEqual([
            { kind: 'solid', code: '0 0 a 0' },
            { kind: 'solid', code: 'a 0 k 5' },
            { kind: 'scenery', code: '0 0 0 a 2' },
            { kind: 'item', code: 'T 3 4' },
        ]);
    });

    test('reads no objects from another text, nor from a track file with an unknown item', () => {
        expect(ObjectClipboard.fromText('Hello')).toBeNull();
        expect(ObjectClipboard.fromText('T1Inot base 64!')).toBeNull();

        const main = emptyLayer('main', 'Main');
        main.items.push({ code: 'Y', values: [0, 0] });
        const file = TrackFormat.toTrackCode({
            layers: [main],
            bike: 'BMX',
            origin: { x: 0, y: 0 },
        });
        expect(ObjectClipboard.fromText(file)).toBeNull();
    });
});

describe('Track counts', () => {
    test('count the targets and the objects of a track, in any format', () => {
        const legacy = '0 0 a 0 k 0#0 5 a 5#T 0 0,T a 0,C 5 5##BMX#0 0';
        expect(TrackFormat.targetCount(legacy)).toBe(2);
        // Two solid lines of a polyline, a scenery line, three items
        expect(TrackFormat.objectCount(legacy)).toBe(6);

        const file = TrackFormat.toTrackCode(TrackFormat.read(legacy));
        expect(TrackFormat.targetCount(file)).toBe(2);
        expect(TrackFormat.objectCount(file)).toBe(6);
        // The bytes themselves, as the site downloads them
        const bytes = TrackFormat.fromText(file)!;
        expect(TrackFormat.targetCount(bytes)).toBe(2);
    });
});
