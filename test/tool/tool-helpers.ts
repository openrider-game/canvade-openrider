import { Keyboard, Vector } from 'canvade';
import { afterEach, beforeEach, vi } from 'vitest';
import { DrawingLines } from '../../src/openrider/tool/line/drawing-lines';
import { Tool } from '../../src/openrider/tool/tool';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { keyEvent, mouseEvent, moveMouse, parseTrack } from '../helpers/track';

/** A track with its tools, selected and used with the mouse, for the tests of the tools. */

export let track: Track;

/** Creates a tool, registers it like the interface layer does and selects it. */
export function select<T extends Tool>(toolClass: new (track: Track) => T): T {
    const tool = new toolClass(track);
    tool.registerControls();
    track.toolCollection.add(tool);
    track.toolManager.setTool(tool);
    return tool;
}

/** Presses the mouse at a world position and moves it to another one before releasing it. */
export function drag(from: Vector, to: Vector, steps = 1, onStep?: () => void): void {
    moveMouse(track, from.x, from.y);
    track.lastClick.set(track.mousePos);
    track.toolManager.onMouseDown(mouseEvent());
    for (let step = 1; step <= steps; step++) {
        const progress = step / steps;
        moveMouse(track, from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        track.toolManager.onMouseMove(mouseEvent());
        onStep?.();
    }
    track.toolManager.onMouseUp(mouseEvent());
}

export function click(x: number, y: number): void {
    drag(new Vector(x, y), new Vector(x, y), 0);
}

export const solidLines = () => [...track.layers.main[0].grid.totalSolidLines.values()];
export const objects = () => [...track.layers.main[0].grid.totalObjects.values()];

/** Registers the hooks of the tests using these helpers, called at the top of each file. */
export function useToolTrack(): void {
    beforeEach(() => {
        stubBrowser();
        track = parseTrack('#####BMX#0 0');
    });
    afterEach(() => {
        // Release every key pressed by a test, before removing the document receiving the events
        for (const code of ['KeyQ', 'KeyA']) {
            Keyboard.onKeyUp(keyEvent(code, code.slice(3).toLowerCase()));
        }
        // The kind of lines is shared by the drawing tools
        DrawingLines.setScenery(false);
        DrawingLines.setConnected(false);
        vi.unstubAllGlobals();
    });
}
