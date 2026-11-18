import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cell } from '../../src/openrider/grid/cell/cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;

beforeEach(() => {
    stubBrowser();
    // Two polylines of two lines each, parsed into the store without objects
    track = parseTrack('0 0 a 0 k 0,0 a a a k a###BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const layer = () => track.layers.main[0];
const solid = () => [...layer().grid.totalSolidLines.values()];
/** The solid polylines exported, in base 32. */
function exported(): string[] {
    const generator = new TrackGenerator(track);
    while (!generator.done) {
        generator.currentStep();
    }
    return generator
        .getDocument()
        .layers[0].solid.map((polyline) => polyline.map((v) => v.toString(32)).join(' '));
}

/** Adds a solid line to the main layer. */
function addLine(x1: number, y1: number, x2: number, y2: number): SolidLine {
    const line = new SolidLine(new Vector(x1, y1), new Vector(x2, y2), track);
    line.layer = layer();
    line.addToTrack();
    return line;
}

describe('Store of the lines', () => {
    test('holds the parsed lines in columns, made objects only when asked', () => {
        const store = track.lineStore;

        expect(store.size).toBe(4);
        expect([...store.x1.subarray(0, 4)]).toEqual([0, 10, 0, 10]);
        expect(layer().grid.totalSolidLines.size).toBe(4);
        // The same object while kept
        const [first] = solid();
        expect(store.handle(first.slot)).toBe(first);
        expect(first.uid).toBe('p0');
        expect(track.editor.object('p0')).toBe(first);
        expect(first.pos).toEqual(new Vector(0, 0));
        expect(first.len).toBe(10);
    });

    test('exports the lines in the order they were added, a line added again last', () => {
        expect(exported()).toEqual(['0 0 a 0 k 0', '0 a a a k a']);

        // The first line of the first polyline taken off and put back: after the others
        const [first] = solid();
        first.removeFromTrack();
        expect(first.onTrack).toBe(false);
        expect(first.pos).toEqual(new Vector(0, 0));
        first.addToTrack();

        expect(exported()).toEqual(['a 0 k 0', '0 a a a k a', '0 0 a 0']);
    });

    test('finds the lines by uid, the ones given by the edits too', () => {
        const [, second] = solid();
        second.uid = 'e7';

        expect(track.editor.object('e7')).toBe(second);
        expect(track.editor.object('p1')).toBeUndefined();
        second.removeFromTrack();
        expect(track.editor.object('e7')).toBeUndefined();
    });

    test('keeps a line erased in a batch listed by its cells until the batch ends', () => {
        const cell = layer().grid.cell(0, 0);
        const [first] = solid();

        Cell.batch(() => {
            first.removeFromTrack();
            expect(cell.lineSlots).toContain(0);
            // The object of the line, off the track
            expect(cell.lines[0]).toBe(first);
        });

        expect(cell.lines).not.toContain(first);
    });

    test('compacts its empty slots, the cells and the objects kept following', () => {
        const store = track.lineStore;
        const added = Array.from({ length: 5000 }, (_, i) => addLine(i, 50, i + 5, 50));
        const kept = added[4999];
        added.slice(0, 4999).forEach((line) => line.removeFromTrack());
        const [first] = solid();

        expect(store.compactIfNeeded()).toBe(true);

        expect(store.size).toBe(5);
        expect(store.holes).toBe(0);
        // The objects kept on their new slots, the cells listing them
        expect(kept.slot).toBe(4);
        expect(kept.pos).toEqual(new Vector(4999, 50));
        expect(first.slot).toBe(0);
        const cell = layer().grid.cell(49, 0);
        expect(cell.lineSlots).toEqual([4]);
        expect(cell.lines).toEqual([kept]);
        expect(track.editor.object('p0')).toBe(first);
        expect(exported()).toEqual(['0 0 a 0 k 0', '0 a a a k a', '4s7 1i 4sc 1i']);
    });
});
