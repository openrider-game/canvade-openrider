import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BikeRunner } from '../../src/openrider/bike/runner/bike-runner';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { FlatAlpha } from '../../src/openrider/render/flat-alpha';
import type { Track } from '../../src/openrider/track/track';
import { type CanvasMock, createCanvasMock, stubBrowser } from '../helpers/canvas';
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

/**
 * Styles of the lines and the shapes drawn by a runner, as drawn on the track or on the scratch
 * canvas of the translucent figures (see `FlatAlpha`), and the opacities the figures are copied
 * onto the track at.
 */
function stylesOf(runner: BikeRunner) {
    const strokes: string[] = [];
    const fills: string[] = [];
    const record = ({ context }: CanvasMock) => {
        vi.mocked(context.stroke).mockImplementation(() =>
            strokes.push(`${String(context.strokeStyle)} ${context.globalAlpha}`),
        );
        vi.mocked(context.fill).mockImplementation(() =>
            fills.push(`${String(context.fillStyle)} ${context.globalAlpha}`),
        );
    };
    vi.stubGlobal('document', {
        ...document,
        createElement: () => {
            const canvas = createCanvasMock(0, 0);
            record(canvas);
            return canvas.canvas;
        },
    });
    // A new scratch canvas, recorded
    FlatAlpha['scratch'] = null;

    const track = createCanvasMock();
    record(track);
    const copies: number[] = [];
    vi.mocked(track.context.drawImage).mockImplementation(() =>
        copies.push(track.context.globalAlpha),
    );
    runner.render(track.context);
    return { strokes: [...new Set(strokes)], fills: [...new Set(fills)], copies };
}

describe('Dead riders', () => {
    test('keep the color and the opacity of their runner once crashed', () => {
        const ghost = ghostOf('#a33');
        ghost.crash();
        ghost.instance = null;

        // The limbs in the shadow lighter, as when riding, drawn opaque then copied at the
        // opacity of the ghost as one shape
        const styles = stylesOf(ghost);
        expect(styles.strokes).toEqual(['#a33 0.5', '#a33 1']);
        expect(styles.copies).toEqual([0.6]);

        const player = track.playerRunner;
        player.crash();
        player.instance = null;
        // Opaque, drawn on the track directly
        expect(stylesOf(player)).toMatchObject({ strokes: ['#000 0.5', '#000 1'], copies: [] });
    });

    test('blow up in the color and the opacity of their runner', () => {
        const ghost = ghostOf('#3a3');
        ghost.explode(new Vector(0, 0), new Vector(0, 0));

        // The shards, after the yellow blast, copied at the opacity of the ghost
        const styles = stylesOf(ghost);
        expect(styles.fills.slice(-1)).toEqual(['#3a3 1']);
        expect(styles.copies).toEqual([0.6]);
    });
});

describe('Ghost riders', () => {
    test('are drawn opaque, then copied at the opacity of the ghost as one shape', () => {
        const ghost = ghostOf('#33a');

        const styles = stylesOf(ghost);

        // The limbs in the shadow lighter within the shape, as for the player
        expect(styles.strokes).toEqual(expect.arrayContaining(['#33a 1', '#33a 0.5']));
        expect(styles.strokes.every((style) => !style.endsWith(' 0.6'))).toBe(true);
        expect(styles.copies).toEqual([0.6]);
    });
});

describe('Translucent figures', () => {
    test('are drawn with the state of the canvas they are copied to, e.g. its round joins', () => {
        const scratch = createCanvasMock(0, 0);
        vi.stubGlobal('document', { ...document, createElement: () => scratch.canvas });
        FlatAlpha['scratch'] = null;
        const track = createCanvasMock();
        Object.assign(track.context, {
            lineJoin: 'round',
            lineCap: 'round',
            font: 'bold 15px monospace',
        });

        const seen: Array<[unknown, unknown, unknown]> = [];
        FlatAlpha.draw(track.context, 0.6, [0, 0, 50, 50], (target) =>
            seen.push([target.lineJoin, target.lineCap, target.font]),
        );

        expect(seen).toEqual([['round', 'round', 'bold 15px monospace']]);
    });
});
