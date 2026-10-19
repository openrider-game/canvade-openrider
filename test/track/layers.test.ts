import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { Track } from '../../src/openrider/track/track';
import { TrackLayer } from '../../src/openrider/track/track-layer';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;

const names = () => track.layers.all.map((layer) => layer.name);

function addLine(layer: TrackLayer, y = 0): SolidLine {
    const line = new SolidLine(new Vector(-50, y), new Vector(50, y), track);
    line.layer = layer;
    line.addToTrack();
    return line;
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack('#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Layer stack', () => {
    test('starts with a main and a foreground layer, the main one being active', () => {
        expect(names()).toEqual(['Main', 'Foreground']);
        expect(track.layers.active).toBe(track.layers.main[0]);
        expect(track.layers.main[0].opacityFactor).toBe(1);
        expect(track.layers.foreground[0].opacityFactor).toBe(0.5);
        expect(track.layers.foreground[0].hasPhysics).toBe(false);
    });

    test('adds numbered layers above the active layer, undone like any edit', () => {
        const second = track.layers.add('main');
        const third = track.layers.add('main');
        track.layers.setActive(track.layers.foreground[0]);
        const foreground = track.layers.add('foreground');

        expect(names()).toEqual(['Main', 'Main 2', 'Main 3', 'Foreground', 'Foreground 2']);
        expect(track.layers.active).toBe(foreground);
        expect(track.uiInvalidated).toBe(true);

        track.history.undo();
        expect(names()).toEqual(['Main', 'Main 2', 'Main 3', 'Foreground']);
        expect(track.layers.active).toBe(track.layers.foreground[0]);
        track.history.undo();
        expect(track.layers.all).not.toContain(third);
        track.history.redo();
        expect(track.layers.active).toBe(third);
        expect(second.name).toBe('Main 2');
    });

    test('removes a layer with its objects, and restores them on undo', () => {
        const upper = track.layers.add('main');
        const line = addLine(upper);
        const target = new Target(new Vector(0, 0), track);
        target.layer = upper;
        target.addToTrack();

        expect(track.layers.remove(upper)).toBe(true);
        expect(track.layers.all).not.toContain(upper);
        expect(line.onTrack || target.onTrack).toBe(false);
        expect(track.targets.size).toBe(0);
        // The layer under it becomes active
        expect(track.layers.active).toBe(track.layers.main[0]);

        track.history.undo();
        expect(names()).toEqual(['Main', 'Main 2', 'Foreground']);
        expect(line.onTrack && target.onTrack).toBe(true);
        expect(track.targets.size).toBe(1);
        expect(track.layers.active).toBe(upper);
    });

    test('keeps at least one main layer', () => {
        expect(track.layers.remove(track.layers.main[0])).toBe(false);
        expect(track.layers.remove(track.layers.foreground[0])).toBe(true);
        expect(names()).toEqual(['Main']);
        expect(() => track.layers.reset([new TrackLayer('foreground', 'Alone')])).toThrow(
            'A track needs at least one main layer',
        );
    });

    test('moves and renames layers, undone like any edit', () => {
        const [main, foreground] = track.layers.all;
        track.layers.move(main, 1);
        expect(track.layers.all).toEqual([foreground, main]);
        // Already at the top
        track.layers.move(main, 1);
        expect(track.layers.all).toEqual([foreground, main]);

        track.layers.rename(main, '  Ground ');
        track.layers.rename(main, '   ');
        expect(main.name).toBe('Ground');

        track.history.undo();
        expect(main.name).toBe('Main');
        track.history.undo();
        expect(track.layers.all).toEqual([main, foreground]);
    });

    test('gives the items to the closest main layer under the active one', () => {
        const [main, foreground] = track.layers.all;
        expect(track.layers.itemLayer).toBe(main);

        track.layers.setActive(foreground);
        const upper = track.layers.add('main');
        track.layers.setActive(foreground);
        expect(track.layers.itemLayer).toBe(main);

        track.layers.move(foreground, 1);
        expect(track.layers.itemLayer).toBe(upper);

        // A foreground layer at the bottom of the stack falls back to the first main layer
        track.layers.move(foreground, -2);
        expect(track.layers.itemLayer).toBe(main);
    });
});

describe('Hidden layers', () => {
    test('are only left out of the rendering when asked', () => {
        const hidden = track.layers.add('main');
        addLine(hidden);
        track.layers.setVisible(hidden, false);
        const renderedCells = (hideHiddenLayers: boolean) => {
            const { context } = createCanvasMock();
            TrackRenderer.render(context, track, { hideHiddenLayers });
            return vi.mocked(context.drawImage).mock.calls.length;
        };

        expect(renderedCells(true)).toBe(0);
        expect(renderedCells(false)).toBeGreaterThan(0);
    });

    test('still collide', () => {
        const hidden = track.layers.main[0];
        addLine(hidden, 50);
        track.layers.setVisible(hidden, false);

        for (let tick = 0; tick < 50; tick++) {
            track.playerRunner.fixedUpdate();
        }

        expect(track.playerRunner.instance?.backWheel.pos.y).toBeLessThan(50);
    });
});
