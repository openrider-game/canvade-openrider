import { Keyboard } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PLAYER_CONTROL_NAMES } from '../../src/openrider/bike/runner/player-runner';
import { FullscreenTool } from '../../src/openrider/tool/misc/fullscreen.tool';
import { TOUCH_ELEMENT_TYPE, TouchControls } from '../../src/openrider/touch/touch-controls';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';

/** Definition of a touch button, by class name. */
function button(definitions: ReturnType<typeof TouchControls.ui>, className: string) {
    const key = `${TOUCH_ELEMENT_TYPE}.overlay.touch.${className}`;
    const entry = definitions.structure.find(
        (element) => typeof element === 'object' && key in element,
    ) as Record<string, { data: { icon: string }; events: { press(): void; release(): void } }>;
    return {
        icon: entry[key].data.icon,
        events: entry[key].events,
        style: definitions.styles[`.${className}`] as Record<string, unknown>,
    };
}

beforeEach(() => {
    stubBrowser();
    // Registers the player controls in the keyboard
    new Track(null);
});

afterEach(() => {
    Object.values(PLAYER_CONTROL_NAMES).forEach((name) => Keyboard.release(name));
    vi.unstubAllGlobals();
});

describe('Touch controls', () => {
    const insets = { left: 26, right: 26, bottomLeft: 36, bottomRight: 120 };

    test('are UI buttons at the bottom corners, clear of the interface, sharing their borders', () => {
        const definitions = TouchControls.ui(400, insets);
        const left = button(definitions, 'touch-left').style;
        const right = button(definitions, 'touch-right').style;
        const up = button(definitions, 'touch-up').style;
        const down = button(definitions, 'touch-down').style;
        const turn = button(definitions, 'touch-turn').style;

        expect([left.horizontalAlign, left.verticalAlign]).toEqual(['left', 'bottom']);
        expect(left.x).toBeGreaterThan(26);
        expect(left.y).toBeGreaterThanOrEqual(36);
        expect(right.x).toBe(Number(left.x) + Number(left.width));
        expect(up.horizontalAlign).toBe('right');
        expect(button(definitions, 'touch-up').icon).toBe('accelerate');
        expect(up.x).toBeGreaterThan(26);
        expect(down.x).toBe(Number(up.x) + Number(up.width));
        expect(up.y).toBeGreaterThanOrEqual(120);
        expect(turn.y).toBe(Number(up.y) + Number(up.height));
    });

    test('stay under the heads-up display on low canvases', () => {
        const up = button(TouchControls.ui(200, insets), 'touch-up').style;

        // 70 pixels of heads-up display above the 64 pixels of the button
        expect(Number(up.y)).toBeLessThanOrEqual(200 - 70 - 64);
    });

    test('hold their player control down while pressed', () => {
        const { events } = button(TouchControls.ui(400, insets), 'touch-up');

        events.press();
        expect(Keyboard.isDown(PLAYER_CONTROL_NAMES.up)).toBe(true);
        events.release();
        expect(Keyboard.isDown(PLAYER_CONTROL_NAMES.up)).toBe(false);
    });
});

describe('Fullscreen without the Fullscreen API', () => {
    test('makes the host element fill the page, then gives it its styles back', () => {
        const resize = vi.fn();
        vi.stubGlobal('window', { dispatchEvent: resize });
        vi.stubGlobal('document', { fullscreenElement: null });
        const style = {
            cssText: 'width: 702px',
            setProperty: vi.fn(),
        };
        const track = new Track(null);
        track.canvas = { parentElement: { style } } as unknown as HTMLCanvasElement;
        const fullscreen = new FullscreenTool(track);

        fullscreen.run();
        expect(style.setProperty).toHaveBeenCalledWith('position', 'fixed', 'important');
        expect(style.setProperty).toHaveBeenCalledWith('height', '100%', 'important');
        expect(resize).toHaveBeenCalledOnce();

        style.cssText = 'width: 100%';
        fullscreen.run();
        expect(style.cssText).toBe('width: 702px');
        expect(resize).toHaveBeenCalledTimes(2);
    });
});
