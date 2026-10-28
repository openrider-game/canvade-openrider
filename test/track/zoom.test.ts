import { Display, Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RenderCell } from '../../src/openrider/grid/cell/render-cell';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { RenderPriority, WorkerPool } from '../../src/openrider/thread/worker-pool';
import { Track } from '../../src/openrider/track/track';
import { Zoom } from '../../src/openrider/track/zoom';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    Display.pixelRatio = 1;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Zoom levels', () => {
    test('convert between view and pixel zooms', () => {
        expect(Zoom.toPixel(0.6, 2)).toBe(1.2);
        expect(Zoom.toPixel(0.6, 1.25)).toBe(0.75);
        expect(Zoom.toView(0.75, 1.25)).toBe(0.6);
    });

    test('step within the bounds', () => {
        expect(Zoom.step(0.6, 1)).toBe(0.8);
        expect(Zoom.step(0.2, -1)).toBe(0.2);
        expect(Zoom.step(3.9, 1)).toBe(4);
        expect(Zoom.levels(1)).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    });
});

describe('Tracks on high density screens', () => {
    test('are drawn at the pixel ratio, keeping their view zoom', () => {
        Display.pixelRatio = 2;
        const track = new Track();

        expect(track.zoomFactor).toBe(1.2);
        expect(track.viewZoom).toBe(0.6);

        track.setPixelRatio(1);
        expect(track.zoomFactor).toBe(0.6);
        track.setPixelRatio(2);
        expect(track.zoomFactor).toBe(1.2);
    });

    test('zoom by steps of view zoom, keeping the zoomed point in place', () => {
        Display.pixelRatio = 2;
        const track = new Track();
        track.canvas = createCanvasMock(1400, 800).canvas;
        const point = new Vector(100, 50);
        const before = track.toPixel(point);

        track.zoomAt(point, 1);

        expect(track.viewZoom).toBe(0.8);
        expect(track.zoomFactor).toBe(1.6);
        expect(track.toPixel(point).x).toBeCloseTo(before.x);
        expect(track.toPixel(point).y).toBeCloseTo(before.y);
    });

    test('prefetch the zoom levels around the view zoom, at the pixel ratio', () => {
        const track = new Track();
        const request = vi.spyOn(WorkerPool, 'request').mockImplementation(() => {});
        const cell = new RenderCell(0, 0, 400);
        for (let i = 0; i <= 500; i++) {
            cell.push(new SolidLine(new Vector(0, i % 400), new Vector(300, i % 400), track));
        }

        cell.getImage(1.2, { opacityFactor: 1, fastRender: true, pixelRatio: 2 });

        expect(request.mock.calls.map(([, zoom, , priority]) => [zoom, priority])).toEqual([
            [1.2, RenderPriority.VISIBLE],
            [0.4, RenderPriority.FALLBACK],
            [0.8, RenderPriority.ADJACENT],
            [1.6, RenderPriority.ADJACENT],
        ]);
    });
});

describe('Zoom settling', () => {
    test('waits for the zoom to stay the same, and for the zoom of a command block to be reached', () => {
        let now = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const track = new Track(null);
        track.followZoom();
        expect(track.zoomSettled).toBe(true);

        track.zoomFactor = 1.2;
        track.followZoom();
        expect(track.zoomSettled).toBe(false);
        now += 100;
        track.followZoom();
        expect(track.zoomSettled).toBe(false);
        now += 60;
        expect(track.zoomSettled).toBe(true);

        track.zoomTarget = 2;
        expect(track.zoomSettled).toBe(false);
    });
});
