import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ObjectClipboard } from '../../src/openrider/edit/object-clipboard';
import { templateThumbnail } from '../../src/openrider/edit/template-thumbnail';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import type { Track } from '../../src/openrider/track/track';
import { CanvasMock, createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;
let thumbnail: CanvasMock;

beforeEach(() => {
    stubBrowser();
    track = parseTrack('#####BMX#0 0');
    // The canvas of the thumbnail, kept to read what is drawn on it
    vi.stubGlobal('document', {
        createElement: () => {
            thumbnail = createCanvasMock(0, 0);
            return thumbnail.canvas;
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Points passed to a path method of the thumbnail context, e.g. `moveTo`. */
function points(method: 'moveTo' | 'lineTo' | 'arc'): Array<[number, number]> {
    const spy = thumbnail.context[method] as unknown as ReturnType<typeof vi.fn>;
    return spy.mock.calls.map(([x, y]) => [x as number, y as number]);
}

describe('Template thumbnail', () => {
    test('scales the area of the objects to fit the thumbnail within its padding, centered', () => {
        const objects = [
            new SolidLine(new Vector(0, 0), new Vector(1000, 0), track),
            new SceneryLine(new Vector(0, 200), new Vector(1000, 200), track),
        ];

        expect(templateThumbnail(objects)).toBe('iVBORw0KGgo=');

        expect(thumbnail.canvas.width).toBe(500);
        expect(thumbnail.canvas.height).toBe(300);
        // 1000 x 200 world units scaled to 460 pixels wide, the width limiting
        const drawn = [...points('moveTo'), ...points('lineTo')];
        const xs = drawn.map(([x]) => x);
        const ys = drawn.map(([, y]) => y);
        expect(Math.min(...xs)).toBeCloseTo(20);
        expect(Math.max(...xs)).toBeCloseTo(480);
        expect(Math.min(...ys)).toBeCloseTo(104);
        expect(Math.max(...ys)).toBeCloseTo(196);
    });

    test('draws a few objects no larger than the largest zoom, at the center', () => {
        const objects = ObjectClipboard.instantiate([{ kind: 'item', code: 'T 0 0' }], track);

        templateThumbnail(objects);

        // Traced without OffscreenCanvas, a target being a circle
        expect(points('arc')).toEqual([[250, 150]]);
        expect(thumbnail.context.lineWidth).toBe(8);
    });

    test('has no thumbnail without objects', () => {
        expect(templateThumbnail([])).toBeNull();
    });
});
