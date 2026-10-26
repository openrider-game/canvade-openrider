import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import type { Track } from '../../src/openrider/track/track';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

let track: Track;

beforeEach(() => {
    stubBrowser();
    track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** A ghost of a given color, on the track. */
function ghostOf(color: string): GhostRunner {
    const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost', false);
    ghost.color = color;
    ghost.createBike();
    return ghost;
}

/** Styles of the lines and the shapes drawn by a runner, as drawn. */
function stylesOf(runner: BikeRunner) {
    const { context } = createCanvasMock();
    const strokes: string[] = [];
    const fills: string[] = [];
    vi.mocked(context.stroke).mockImplementation(() =>
        strokes.push(`${String(context.strokeStyle)} ${context.globalAlpha}`),
    );
    vi.mocked(context.fill).mockImplementation(() =>
        fills.push(`${String(context.fillStyle)} ${context.globalAlpha}`),
    );
    runner.render(context);
    return { strokes: [...new Set(strokes)], fills: [...new Set(fills)] };
}

describe('Dead riders', () => {
    test('keep the color and the opacity of their runner once crashed', () => {
        const ghost = ghostOf('#a33');
        ghost.crash();
        ghost.instance = null;

        // The limbs in the shadow lighter, as when riding
        expect(stylesOf(ghost).strokes).toEqual(['#a33 0.3', '#a33 0.6']);

        const player = track.playerRunner;
        player.crash();
        player.instance = null;
        expect(stylesOf(player).strokes).toEqual(['#000 0.5', '#000 1']);
    });

    test('blow up in the color and the opacity of their runner', () => {
        const ghost = ghostOf('#3a3');
        ghost.explode(new Vector(0, 0), new Vector(0, 0));

        // The shards, after the yellow blast
        expect(stylesOf(ghost).fills.slice(-1)).toEqual(['#3a3 0.6']);
    });
});
