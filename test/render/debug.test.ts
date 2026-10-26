import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { MODIFIERS } from '../../src/openrider/item/modifiers';
import { DebugOptions } from '../../src/openrider/track/debug-options';
import { debugStats } from '../../src/openrider/track/debug-stats';
import { Track } from '../../src/openrider/track/track';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;

/** Renders the track in debug mode with only the given overlays. */
function renderDebug(enabled: Partial<DebugOptions>) {
    for (const option of Object.keys(track.debugOptions) as Array<keyof DebugOptions>) {
        track.debugOptions[option] = enabled[option] ?? false;
    }
    const mock = createCanvasMock();
    TrackRenderer.render(mock.context, track, { debug: true });
    return mock;
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack('-50 1i 1k0 1i##T 0 0###BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Debug overlays', () => {
    test('are drawn only when enabled', () => {
        const none = renderDebug({});
        const grids = renderDebug({ grids: true });

        expect(grids.calls.filter((call) => call === 'lineTo').length).toBeGreaterThan(
            none.calls.filter((call) => call === 'lineTo').length,
        );
        // The item ids
        expect(vi.mocked(renderDebug({ objects: true }).context.fillText)).toHaveBeenCalled();
        expect(vi.mocked(none.context.fillText)).not.toHaveBeenCalled();
    });

    test('draw the springs, points and velocities of the bikes', () => {
        const none = renderDebug({});
        const bikes = renderDebug({ bikes: true });

        // Three points and their velocities, three springs
        const count = (calls: string[], name: string) =>
            calls.filter((call) => call === name).length;
        expect(count(bikes.calls, 'arc') - count(none.calls, 'arc')).toBe(3);
        expect(count(bikes.calls, 'lineTo') - count(none.calls, 'lineTo')).toBe(6);
    });

    test('tint the render cells by the state of their image', () => {
        const { context } = renderDebug({ cells: true });

        // The rendering made the image of the visible cells up to date
        const fills: unknown[] = [];
        vi.mocked(context.fillRect).mockImplementation(() => fills.push(context.fillStyle));
        TrackRenderer.render(context, track, { debug: true });
        expect(fills).toContain('#00aa0022');
    });
});

describe('Render cell states', () => {
    test('tell whether the image is current, stale, of another zoom or missing', () => {
        const cell = new RenderCell(0, 0, 400);
        expect(cell.imageState(1)).toBe('none');

        const line = new SolidLine(new Vector(0, 0), new Vector(100, 0), track);
        cell.push(line);
        cell.getImage(1, 1, false);
        expect(cell.imageState(1)).toBe('current');
        expect(cell.imageState(0.6)).toBe('other-zoom');

        cell.push(new SolidLine(new Vector(0, 10), new Vector(100, 10), track));
        expect(cell.imageState(1)).toBe('stale');
    });
});

describe('Debug stats', () => {
    test('describe the frame, the view, the track and the player', () => {
        track.pause(true);
        track.playerRunner.time = 120;
        track.playerRunner.controls.upPressed = true;
        track.playerRunner.controls.leftPressed = true;
        track.playerRunner.modifiersMask = MODIFIERS.SLIPPERY | MODIFIERS.ZERO_GRAVITY;

        expect(debugStats(track, 59.6)).toEqual([
            '60 fps · tick 120 (paused)',
            'zoom 0.60 · camera 0 0',
            'mouse 0 0',
            '2 layers · 1 lines · 0 scenery · 1 items',
            'workers: unsupported',
            'inputs: ↑ ←',
            'status: slippery, zero gravity',
        ]);
    });

    test('show nothing pressed and no status with dashes', () => {
        const [, , , , , inputs, status] = debugStats(track, 0);

        expect(inputs).toBe('inputs: -');
        expect(status).toBe('status: -');
    });
});
