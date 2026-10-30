import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cell } from '../../src/openrider/grid/cell/cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;

beforeEach(() => {
    stubBrowser();
    track = parseTrack('#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Lines of the main layer, in the first physics cell, from x = 0 to 90 every 10 units. */
function addLines(count = 10): SolidLine[] {
    return Array.from({ length: count }, (_, i) => {
        const line = new SolidLine(new Vector(i * 10, 50), new Vector(i * 10 + 5, 52), track);
        line.layer = track.layers.main[0];
        line.addToTrack();
        return line;
    });
}

const physicsCell = () => track.layers.main[0].grid.cell(0, 0);
const starts = () => physicsCell().lines.map((line) => line.pos.x);

describe('Objects removed in a batch', () => {
    test('leave their cells at its end, in a single pass keeping the order of the others', () => {
        const lines = addLines();
        const list = physicsCell().lines;
        const filter = vi.spyOn(Array.prototype, 'filter');

        Cell.batch(() => {
            [lines[1], lines[4], lines[8]].forEach((line) => line.removeFromTrack());
            // Off the track at once, still listed until the end of the batch
            expect(lines[4].onTrack).toBe(false);
            expect(starts()).toHaveLength(10);
        });

        expect(starts()).toEqual([0, 20, 30, 50, 60, 70, 90]);
        // A pass per list of each cell touched, rather than one per object removed
        const passes = filter.mock.contexts.filter((context) => context === list);
        filter.mockRestore();
        expect(passes).toHaveLength(1);
    });

    test('are taken off before an object added during the batch, as without a batch', () => {
        const lines = addLines(3);
        const added = new SolidLine(new Vector(35, 50), new Vector(40, 52), track);
        added.layer = track.layers.main[0];

        Cell.batch(() => {
            lines[0].removeFromTrack();
            added.addToTrack();
            lines[2].removeFromTrack();
        });

        expect(starts()).toEqual([10, 35]);
    });

    test('nest, the objects leaving their cells at the end of the outer batch', () => {
        const lines = addLines(4);

        Cell.batch(() => {
            Cell.batch(() => lines[0].removeFromTrack());
            expect(starts()).toHaveLength(4);
            lines[3].removeFromTrack();
        });

        expect(starts()).toEqual([10, 20]);
    });

    test('are erased and restored by undo and redo with the same order', () => {
        addLines();
        const before = starts();
        const eraser = { solid: true, scenery: true, item: true };

        track.history.startGroup();
        const erased = track.checkDelete(new Vector(40, 50), 12, eraser, [track.layers.main[0]]);
        track.editor.recordRemoved(erased);
        track.history.endGroup();
        expect(starts()).toEqual([0, 10, 20, 60, 70, 80, 90]);

        track.history.undo();
        expect(starts().sort((a, b) => a - b)).toEqual(before);
        track.history.redo();
        expect(starts()).toEqual([0, 10, 20, 60, 70, 80, 90]);
    });
});
