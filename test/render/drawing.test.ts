import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { MODIFIERS } from '../../src/openrider/item/modifiers';
import { BoostTool, TargetTool, TeleporterTool } from '../../src/openrider/tool/item/item.tools';
import { ResetTool } from '../../src/openrider/tool/item/status.tools';
import { BrushTool } from '../../src/openrider/tool/line/brush.tool';
import { LineTool } from '../../src/openrider/tool/line/line.tool';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { StartPositionTool } from '../../src/openrider/tool/misc/start-position.tool';
import { Tool } from '../../src/openrider/tool/tool';
import { Track } from '../../src/openrider/track/track';
import { TrackRenderer } from '../../src/openrider/track/track-renderer';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { mouseEvent, moveMouse, parseTrack, seededRandom } from '../helpers/track';

// Every kind of item, around the start position
const ITEMS_TRACK =
    '-50 1i 1k0 1i##T 0 0,C a 0,B k 0 0,G u 0 2s,O 14 0,S 1e 0,W 1o 0 28 0,' +
    'R 2i 0,I 2s 0,H 36 0,N 3g 0,E 3q 0#0 -a a -a##MTB#0 0';

let track: Track;

function render(debug = false) {
    const mock = createCanvasMock();
    TrackRenderer.render(mock.context, track, { debug });
    return mock;
}

beforeEach(() => {
    stubBrowser();
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(7));
    track = parseTrack(ITEMS_TRACK);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Track drawing', () => {
    test('draws the items, the bikes and the ghosts', () => {
        const ghost = new GhostRunner(track, ',,,,,100,BMX,Rival');
        ghost.createBike();
        track.ghostRunners.set(1, ghost);
        // Status effects drawn as glows around the bike
        track.playerRunner.modifiersMask = MODIFIERS.SLIPPERY | MODIFIERS.INVINCIBILITY;

        const { context, calls } = render(true);

        expect(calls).toContain('arc');
        expect(calls).toContain('rotate');
        expect(calls).toContain('rect');
        expect(vi.mocked(context.fillText).mock.calls.map(([text]) => text)).toContain('Rival');
        expect(context.shadowColor).toBeDefined();
    });

    test('draws the rider of both bikes', () => {
        const mtbStrokes = render().calls.filter((call) => call === 'stroke').length;
        track.playerRunner.bikeClass = new GhostRunner(track, ',,,,,0,BMX').bikeClass;
        track.playerRunner.createBike();
        track.restart();
        const bmxStrokes = render().calls.filter((call) => call === 'stroke').length;

        expect(mtbStrokes).toBeGreaterThan(10);
        expect(bmxStrokes).toBeGreaterThan(10);
    });

    test('draws the ragdoll of a crashed rider and the shards of an explosion', () => {
        const bike = track.playerRunner.instance;
        if (!bike) throw new Error('No bike');
        track.playerRunner.crash();
        track.playerRunner.update(0.5, 20);
        const crashed = render();
        expect(crashed.calls.filter((call) => call === 'stroke').length).toBeGreaterThan(3);

        track.restart();
        track.playerRunner.explode(new Vector(0, 0), new Vector(1, 1));
        track.playerRunner.fixedUpdate();
        track.playerRunner.update(0.5, 20);
        const exploded = render();
        expect(exploded.calls.filter((call) => call === 'fill').length).toBeGreaterThan(5);
    });
});

describe('Tool previews', () => {
    function preview(toolClass: new (track: Track) => Tool, setup?: (tool: Tool) => void) {
        const tool = new toolClass(track);
        tool.registerControls();
        track.toolCollection.add(tool);
        track.toolManager.setTool(tool);
        track.mouseIn = true;
        moveMouse(track, 50, 50);
        track.toolManager.onMouseMove(mouseEvent());
        setup?.(tool);

        const mock = createCanvasMock();
        track.toolManager.render(mock.context);
        return mock;
    }

    test.each([
        ['item', TargetTool],
        ['status item', ResetTool],
        ['eraser', EraserTool],
        ['start position', StartPositionTool],
    ] as const)('draws the %s tool cursor', (_name, toolClass) => {
        expect(preview(toolClass).calls.length).toBeGreaterThan(0);
    });

    test('draws the line being drawn with its length and angle', () => {
        const { context } = preview(LineTool, () => {
            track.lastClick.set(new Vector(0, 50));
            track.toolManager.onMouseDown(mouseEvent());
        });

        const texts = vi.mocked(context.fillText).mock.calls.map(([text]) => text);
        expect(texts).toEqual(expect.arrayContaining(['50', '0°']));
    });

    test('draws the brush size', () => {
        const { context } = preview(BrushTool);

        expect(vi.mocked(context.fillText).mock.calls.map(([text]) => text)).toContain('20');
    });

    test('draws the direction of a directional item while placing it', () => {
        const { calls } = preview(BoostTool, () => {
            track.lastClick.set(new Vector(0, 0));
            track.toolManager.onMouseDown(mouseEvent());
        });

        expect(calls).toContain('rotate');
    });

    test('draws the links of the linked items being placed', () => {
        const { calls } = preview(TeleporterTool, () => {
            track.toolManager.onMouseDown(mouseEvent());
            moveMouse(track, 150, 50);
        });

        expect(calls.filter((call) => call === 'lineTo').length).toBeGreaterThan(0);
    });
});
