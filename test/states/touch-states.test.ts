import { EventFactory, Keyboard, UIElement, Vector } from 'canvade';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PLAYER_CONTROL_NAMES } from '../../src/openrider/bike/runner/player-runner';
import { TouchControls } from '../../src/openrider/touch/touch-controls';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_ENDURANCE_SETUP,
    STATE_TRACK_ENDURANCE,
    STATE_ROTATE_HINT,
} from '../../src/states/state-names';
import { UIToolButton } from '../../src/states/track/ui/ui-tool-button';
import { RotateHintState } from '../../src/states/rotate-hint/rotate-hint.state';
import { createCanvasMock } from '../helpers/canvas';
import { manager, session, runUntil, mouseEvent, useGame } from './game-helpers';

useGame();

describe('Touch screens', () => {
    /** Pointer event of the game of a finger acting alone, at a position in canvas pixels. */
    const touch = (name: string, id: number, x: number, y: number) =>
        EventFactory.createGameEvent({
            name,
            consumed: false,
            position: new Vector(x, y),
            pointerEvent: { pointerId: id, pointerType: 'touch', button: 0 } as PointerEvent,
            primary: true,
        });
    /** Elements of the interface, laid out on a frame. */
    const interfaceElements = () => {
        manager.update(0.5, 20);
        manager.render(createCanvasMock().context);
        const root = manager.getCurrent()?.layers.get('interface')?.uiRenderer.getRootElement();
        return root?.children ?? [];
    };
    const touchButtons = () =>
        interfaceElements().filter((element) => element.classNames.includes('touch'));
    const byClass = (elements: UIElement[], className: string) => {
        const element = elements.find((candidate) => candidate.classNames.includes(className));
        if (!element) throw new Error(`No element .${className}`);
        return element.getBounds();
    };

    afterEach(() => {
        TouchControls.enabled = false;
        Object.values(PLAYER_CONTROL_NAMES).forEach((name) => Keyboard.release(name));
    });

    test('ride with UI buttons once the screen is touched, never shown before', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent();
        expect(touchButtons()).toEqual([]);

        // The first touch shows them from the next frame
        state?.dispatch('pointerDown', touch('pointerDown', 1, 350, 200));
        state?.dispatch('pointerUp', touch('pointerUp', 1, 350, 200));
        const buttons = touchButtons();
        expect(buttons.map((element) => element.data['icon'])).toEqual([
            'lean-back',
            'lean-forward',
            'brake',
            'accelerate',
            'turn',
        ]);

        const up = byClass(buttons, 'touch-up');
        const [x, y] = [up.x + up.width / 2, up.y + up.height / 2];
        const press = touch('pointerDown', 2, x, y);
        state?.dispatch('pointerDown', press);
        expect(press.detail.consumed).toBe(true);
        expect(Keyboard.isDown(PLAYER_CONTROL_NAMES.up)).toBe(true);

        state?.dispatch('pointerUp', touch('pointerUp', 2, x, y));
        expect(Keyboard.isDown(PLAYER_CONTROL_NAMES.up)).toBe(false);
    });

    test('enlarge the interface while touching, hiding the keyboard tools, until a mouse is used', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent();
        const toolNames = () =>
            interfaceElements()
                .filter((element): element is UIToolButton => element instanceof UIToolButton)
                .map((element) => element.tool?.toolClass.toolName);
        expect(byClass(interfaceElements(), 'left-0').width).toBe(26);
        expect(toolNames()).toContain('Controls');

        state?.dispatch('pointerDown', touch('pointerDown', 1, 350, 200));
        state?.dispatch('pointerUp', touch('pointerUp', 1, 350, 200));
        expect(byClass(interfaceElements(), 'left-0').width).toBe(44);
        expect(toolNames()).not.toContain('Controls');

        state?.dispatch('pointerDown', mouseEvent('pointerDown', 350, 200));
        state?.dispatch('pointerUp', mouseEvent('pointerUp', 350, 200));
        expect(byClass(interfaceElements(), 'left-0').width).toBe(26);
        expect(toolNames()).toContain('Controls');
        expect(touchButtons()).toEqual([]);
    });

    test('fit the toolbars in the canvas, the other tools next to a More button', async () => {
        TouchControls.enabled = true;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        // A canvas of 300 pixels: 6 buttons of 44 pixels
        const frame = () => {
            manager.update(0.5, 20);
            manager.render(createCanvasMock(700, 300).context);
            const layer = manager.getCurrent()?.layers.get('interface');
            return layer?.uiRenderer.getRootElement()?.children ?? [];
        };
        const name = (element: UIElement) =>
            element instanceof UIToolButton ? element.tool?.toolClass.toolName : undefined;
        const toolbar = (elements: UIElement[]) =>
            elements.filter((element) => /^left-\d+$/.test(element.classNames[1])).map(name);
        const byName = (elements: UIElement[], toolName: string) => {
            const element = elements.find((candidate) => name(candidate) === toolName);
            if (!element) throw new Error(`No tool ${toolName}`);
            const { x, y } = element.getBounds();
            return { element, x: x + 1, y: y + 1 };
        };
        frame();
        let elements = frame();
        expect(toolbar(elements)).toEqual([
            'Pause',
            'Restart',
            'Cancel Checkpoint',
            'Switch Bike',
            'Camera',
            'More',
        ]);
        // The keyboard tools are hidden, e.g. the debug mode at the right
        expect(elements.map(name)).not.toContain('Toggle Debug');

        const more = byName(elements, 'More');
        more.element.handleClick(more.x, more.y, {} as MouseEvent);
        elements = frame();
        const column = elements.find((element) => element.classNames.includes('left-more-0'));
        expect(column?.children.map(name)).toEqual(['Toggle Fullscreen', 'Undo', 'Redo']);

        // Running one of them closes them
        const undo = byName(column?.children ?? [], 'Undo');
        undo.element.handleClick(undo.x, undo.y, {} as MouseEvent);
        elements = frame();
        expect(elements.some((element) => element.classNames.includes('left-more-0'))).toBe(false);

        // Holding a button shows its tooltip, without running its tool
        const pause = byName(elements, 'Pause');
        const button = pause.element as UIToolButton;
        const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
        button.press();
        now.mockReturnValue(1600);
        expect(button.isHeldLong()).toBe(true);
        button.release();
        const paused = session.track.paused;
        button.handleClick(pause.x, pause.y, {} as MouseEvent);
        expect(session.track.paused).toBe(paused);
    });

    test('start the editor with the layers panel closed, with larger rows', async () => {
        TouchControls.enabled = true;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        // Its title only: a row of 40 pixels and the padding
        expect(byClass(interfaceElements(), 'layers').height).toBe(48);

        // The action buttons in a menu, right of the left toolbar, closed
        const menu = () => {
            const element = interfaceElements().find((candidate) =>
                candidate.classNames.includes('actions'),
            );
            if (!element) throw new Error('No actions menu');
            return element;
        };
        expect(menu().getBounds()).toMatchObject({ x: 54, height: 48 });
        const panel = menu();
        const leftBefore = byClass(interfaceElements(), 'touch-left').y;
        const toggle = panel.children[0];
        toggle.handleClick(toggle.getBounds().x + 1, toggle.getBounds().y + 1, {} as MouseEvent);
        expect(panel.children.map((element) => element.v('text'))).toEqual([
            'Actions ▼',
            'Import',
            'Export code',
            'Export editor',
            'Upload',
        ]);

        // Sliding up like the layers panel, without rebuilding the interface, the riding buttons
        // above it following it: 200 ms of animation, frames of 20 ms
        for (let frame = 0; frame < 15; frame++) {
            interfaceElements();
        }
        expect(menu()).toBe(panel);
        expect(panel.getBounds().height).toBe(2 * 4 + 5 * 40);
        expect(byClass(interfaceElements(), 'touch-left').y).toBeLessThan(leftBefore);
    });

    test('show the buttons in the editor with the camera tool only, clear of the interface', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        TouchControls.enabled = true;

        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Camera');
        const elements = interfaceElements();
        const left = byClass(elements, 'touch-left');
        const up = byClass(elements, 'touch-up');
        // Above the actions menu at the bottom left, and the layers panel at the bottom right
        expect(left.y + left.height).toBeLessThanOrEqual(byClass(elements, 'actions').y);
        expect(up.y + up.height).toBeLessThanOrEqual(byClass(elements, 'layers').y);

        session.track.toolCollection.getByToolName('Line')?.run();
        expect(touchButtons()).toEqual([]);
    });

    test('slide the layers panel with the buttons above it, keeping the interface', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        TouchControls.enabled = true;
        const elements = interfaceElements();
        const panel = elements.find((element) => element.classNames.includes('layers'));
        const descendants = (element: UIElement): UIElement[] => [
            element,
            ...element.children.flatMap(descendants),
        ];
        const toggle = descendants(panel as UIElement).find((element) =>
            String(element.properties.text?.getValue() ?? '').startsWith('Layers ('),
        );
        if (!panel || !toggle) throw new Error('No layers panel');
        const openHeight = panel.getBounds().height;
        const upBefore = byClass(elements, 'touch-up').y;

        // Closing the panel: 200 ms of animation, frames of 20 ms
        const bounds = toggle.getBounds();
        toggle.handleClick(bounds.x + 1, bounds.y + 1, {} as MouseEvent);
        for (let frame = 0; frame < 4; frame++) {
            interfaceElements();
        }
        expect(interfaceElements()).toContain(panel);
        const height = panel.getBounds().height;
        expect(height).toBeLessThan(openHeight);
        expect(height).toBeGreaterThan(30);

        for (let frame = 0; frame < 15; frame++) {
            interfaceElements();
        }
        const after = interfaceElements();
        expect(after).toContain(panel);
        const up = byClass(after, 'touch-up');
        expect(up.y).toBeGreaterThan(upBefore);
        expect(up.y + up.height).toBeLessThanOrEqual(panel.getBounds().y);
    });

    test('ask to turn a device held upright before loading, until turned', async () => {
        let portrait = true;
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('portrait') ? portrait : query.includes('coarse'),
        }));
        expect(RotateHintState.isNeeded()).toBe(true);

        // Held upright: nothing loads, the hint having no button going on anyway
        manager.push(STATE_ROTATE_HINT);
        for (let frame = 0; frame < 5; frame++) {
            manager.update(0.5, 20);
        }
        manager.render(createCanvasMock(330, 400).context);
        await runUntil(STATE_ROTATE_HINT, 0);
        const root = manager.getCurrent()?.layers.get('main')?.uiRenderer.getRootElement();
        const panel = root?.children[0];
        expect(panel?.children.map((element) => element.type)).toEqual(['image', 'text']);

        // Turned sideways: the game goes on
        portrait = false;
        await runUntil(STATE_TRACK_EDITING);
    });

    test('drag the view with two fingers and zoom by pinching them', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent();
        const track = session.track;
        const pinch = (name: string, x: number, scale: number) =>
            EventFactory.createGameEvent({
                name,
                consumed: false,
                center: new Vector(x, 200),
                scale,
            });
        const zoom = track.viewZoom;

        state?.dispatch('pinchStart', pinch('pinchStart', 350, 1));
        const cameraX = track.camera.x;
        state?.dispatch('pinchMove', pinch('pinchMove', 400, 1));
        expect(track.focalPoint).toBeNull();
        expect(track.camera.x).toBeCloseTo(cameraX - 50 / track.zoomFactor);

        // Twice as far apart: three steps of 1.25
        state?.dispatch('pinchMove', pinch('pinchMove', 400, 2));
        state?.dispatch('pinchEnd', pinch('pinchEnd', 400, 2));
        expect(track.viewZoom).toBeGreaterThan(zoom);
    });
});
