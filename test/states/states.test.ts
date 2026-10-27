import {
    Display,
    EventFactory,
    Keyboard,
    Mouse,
    State,
    StateClass,
    StateManager,
    UIElement,
    Vector,
} from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { PLAYER_CONTROL_NAMES } from '../../src/openrider/bike/runner/player-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { ControlBindings } from '../../src/openrider/controls/control-bindings';
import { ControlCatalog } from '../../src/openrider/controls/control-catalog';
import { TouchControls } from '../../src/openrider/touch/touch-controls';
import { GhostService } from '../../src/openrider/request/ghost-service';
import { TRACK_DEFAULT, TRACK_MODE_RACING } from '../../src/openrider/track/track.constants';
import { Session } from '../../src/states/session';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_GENERATOR,
    STATE_TRACK_PARSER,
    STATE_TRACK_RACING,
    STATE_ENDURANCE_SETUP,
    STATE_TRACK_ENDURANCE,
    STATE_ROTATE_HINT,
} from '../../src/states/state-names';
import { TrackEnduranceState } from '../../src/states/endurance/track-endurance.state';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import States from '../../src/states/states';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { TrackEditingState } from '../../src/states/track/track-editing.state';
import { ToolIcons } from '../../src/states/track/ui/tool-icons';
import { UIToolButton } from '../../src/states/track/ui/ui-tool-button';
import { RotateHintState } from '../../src/states/rotate-hint/rotate-hint.state';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { keyEvent, pressKey, releaseKey } from '../helpers/track';

const RACE_CODE = '-50 1i 1k0 1i##T 9c 18###BMX#0 0';

let manager: StateManager;
let session: Session;

/** Creates the states of the game, like `main.ts` does. */
function createGame(): void {
    manager = new StateManager();
    session = new Session(manager.shared);
    for (const { name, state } of Object.values(States)) {
        manager.addState(state as StateClass<State>, name);
    }
}

/** Runs frames until the given state is the current one. */
async function runUntil(stateName: string, frames = 400): Promise<void> {
    const state = manager.getState(stateName);
    for (let frame = 0; frame < frames && manager.getCurrent() !== state; frame++) {
        manager.fixedUpdate();
        manager.update(0.5, 20);
        // Let the pending fetches progress
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    // Compared by name: a diff of two states would print their whole track
    expect(manager.getCurrent()?.constructor.name).toBe(state?.constructor.name);
}

function mouseEvent(name: string, x: number, y: number) {
    Mouse.worldPos.set(new Vector(x, y));
    return EventFactory.createGameEvent({
        name,
        consumed: false,
        position: new Vector(x, y),
        pointerEvent: { pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent,
        primary: true,
    });
}

beforeEach(() => {
    stubBrowser();
    createGame();
});

afterEach(() => {
    Display.pixelRatio = 1;
    GameConfig.editTrack = false;
    // Set by any touch pointer event, it would leak into the next tests
    TouchControls.enabled = false;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Session', () => {
    test('gives typed access to the shared data, with defaults', () => {
        expect(session.trackId).toBeNull();
        expect(session.trackCode).toBeNull();
        expect(session.trackUpload).toBe(false);
        expect(session.hasTrack()).toBe(false);
        expect(() => session.track).toThrow('No track has been parsed yet');

        session.trackId = 12;
        session.trackMode = TRACK_MODE_RACING;
        expect(new Session(manager.shared).trackId).toBe(12);
        expect(new Session(manager.shared).trackMode).toBe(TRACK_MODE_RACING);
    });
});

describe('Editing a track', () => {
    test('loads the default track, then edits it', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        expect(session.trackCode).toBe(TRACK_DEFAULT);
        expect(session.track.isRace()).toBe(false);
        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Camera');
        // The editing tools are available
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeDefined();
        expect(manager.getCurrent()?.getWorld() === session.track).toBe(true);
    });

    test('renders the track, the HUD and the interface', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const { context, calls } = createCanvasMock();

        manager.render(context);

        expect(session.track.canvas).toBe(context.canvas);
        // The frame starts by filling the canvas with the background color
        expect(calls.indexOf('fillRect')).toBeLessThan(calls.indexOf('stroke'));
        // HUD time and interface buttons texts
        expect(vi.mocked(context.fillText).mock.calls.map(([text]) => text)).toEqual(
            expect.arrayContaining(['00:00.0', 'Import', 'Export code', 'Export editor', 'Upload']),
        );
    });

    test('selects the tools with their keyboard shortcuts', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        Keyboard.onKeyDown(keyEvent('KeyQ', 'q'));
        manager.getCurrent()?.dispatch(
            'keyboardDown',
            EventFactory.createGameEvent({
                name: 'keyboardDown',
                consumed: false,
                keyboardEvent: {} as KeyboardEvent,
                key: 'Line',
            }),
        );
        Keyboard.onKeyUp(keyEvent('KeyQ', 'q'));

        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Line');
    });

    test('draws with the mouse, the interface keeping the mouse positions in sync', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Line')?.run();
        const lines = session.track.layers.main[0].grid.totalSolidLines;
        const before = lines.size;

        state?.dispatch('pointerDown', mouseEvent('pointerDown', 300, 200));
        state?.dispatch('pointerMove', mouseEvent('pointerMove', 400, 250));
        state?.dispatch('pointerUp', mouseEvent('pointerUp', 400, 250));

        expect(lines.size).toBe(before + 1);
        const line = [...lines.values()].pop();
        expect(line?.pos).toEqual(new Vector(300, 200));
        expect(line?.endPos).toEqual(new Vector(400, 250));
        expect(session.track.uiHovered).toBe(false);
    });

    test('draws with the primary pointer only, not with a finger that is not', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Line')?.run();
        const lines = session.track.layers.main[0].grid.totalSolidLines;
        const before = lines.size;
        /** A finger joining another one, e.g. to pinch. */
        const secondFinger = (name: string, x: number, y: number) => {
            const event = mouseEvent(name, x, y);
            event.detail.pointerEvent = {
                pointerId: 9,
                pointerType: 'touch',
                button: 0,
            } as PointerEvent;
            event.detail.primary = false;
            return event;
        };

        state?.dispatch('pointerDown', secondFinger('pointerDown', 300, 200));
        state?.dispatch('pointerMove', secondFinger('pointerMove', 400, 250));
        state?.dispatch('pointerUp', secondFinger('pointerUp', 400, 250));

        expect(lines.size).toBe(before);
        expect(session.track.toolManager.tool?.mouseDown).toBe(false);
    });

    test('keeps the tool options in a drawer, opened and closed with its handle', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const state = manager.getCurrent();
        const tool = session.track.toolCollection.getByToolName('Eraser') as EraserTool;
        tool.run();
        const frames = (count: number) => {
            const { context } = createCanvasMock();
            for (let frame = 0; frame < count; frame++) {
                manager.update(0.5, 20);
                manager.render(context);
            }
            return vi.mocked(context.fillText).mock.calls.map(([text]) => text);
        };
        // The size of the eraser in the first row, the layers erased in the second one
        const sizeOption = () => tool.getOptions()[0].label;
        const layerOption = () => tool.getOptions()[1].label;
        const click = (x: number, y: number) => {
            state?.dispatch('pointerDown', mouseEvent('pointerDown', x, y));
            state?.dispatch('pointerUp', mouseEvent('pointerUp', x, y));
        };

        // Closed: only the handle is reachable, at the top of the canvas
        expect(frames(1)).toContain('Options ▼');
        click(250, 37);
        expect(layerOption()).toBe('Layers: active');

        click(350, 10);
        // Sliding down, the options being still out of reach after one frame
        frames(1);
        click(250, 37);
        expect(layerOption()).toBe('Layers: active');
        expect(frames(15)).toContain('Options ▲');
        click(250, 37);
        expect(layerOption()).toBe('Layers: all visible');

        // The size stepped up then down with the + and − buttons at the ends of its row, in a
        // panel of 230 pixels centered on the canvas of 700 pixels
        expect(frames(1)).toEqual(expect.arrayContaining(['−', 'Size: 15', '+']));
        click(445, 15);
        expect(sizeOption()).toBe('Size: 20');
        click(250, 15);
        click(250, 15);
        expect(sizeOption()).toBe('Size: 10');

        // Stays open when the options are rebuilt, then closes from the handle under them: a panel
        // of five rows of 22 pixels, inside a padding of 4 pixels
        expect(frames(1)).toContain('Layers: all visible');
        click(350, 2 * 4 + 5 * 22 + 10);
        frames(15);
        click(250, 37);
        expect(layerOption()).toBe('Layers: all visible');
    });

    test('keeps the interface size on high density screens', async () => {
        Display.pixelRatio = 2;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const { context } = createCanvasMock(1400, 800);

        manager.render(context);

        expect(vi.mocked(context.scale)).toHaveBeenCalledWith(2, 2);
        // The HUD is drawn in UI pixels, the canvas being 700 UI pixels wide
        expect(vi.mocked(context.fillText)).toHaveBeenCalledWith('00:00.0', 30, 15);
        // The icons are rasterized in canvas pixels, to stay sharp
        expect(ToolIcons.get('pause').width).toBe(48);

        // Third button of the right toolbar, the eraser, 26 UI pixels wide, in canvas pixels
        const state = manager.getCurrent();
        state?.dispatch(
            'pointerDown',
            mouseEvent('pointerDown', 2 * (700 - 13), 2 * (2 * 26 + 13)),
        );
        state?.dispatch('pointerUp', mouseEvent('pointerUp', 2 * (700 - 13), 2 * (2 * 26 + 13)));
        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Eraser');
    });

    test('exports the track code as a file', async () => {
        const createObjectURL = vi.fn((blob: Blob) => blob && 'blob:track');
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const editing = manager.getCurrent() as TrackEditingState;

        editing.getButtons()[1].action();
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_GENERATOR)).toBe(true);
        await runUntil(STATE_TRACK_EDITING);

        const [blob] = createObjectURL.mock.calls[0];
        expect(await blob.text()).toBe('-18 1i 18 1i,#####BMX#0 0');
    });

    test('imports a track by parsing the new track code again', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const previous = session.track;

        // What the import button does once the file is read
        session.trackCode = RACE_CODE;
        manager.pop();
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_PARSER)).toBe(true);
        await runUntil(STATE_TRACK_EDITING);

        expect(session.track).not.toBe(previous);
        expect(session.track.targets.size).toBe(1);
    });

    test('pauses the race when the page is hidden', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        vi.stubGlobal('document', { hidden: true });

        manager.getCurrent()?.dispatch('visibilityChange');

        expect(session.track.paused).toBe(true);
    });
});

describe('Endurance mode', () => {
    test('races the ghost of a shared link from the start, once', async () => {
        const fetch = vi.fn(
            async () => new Response(JSON.stringify({ GHOSTSTRING: '0,,,,,200,BMX,Bob' })),
        );
        vi.stubGlobal('fetch', fetch);
        // A shared link races a run on the track of its seed
        GameConfig.seed = 1234;
        GameConfig.ghostIds = [7];

        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        // The ghost is downloaded first
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect([...session.track.ghostRunners.keys()]).toEqual([7]);
        expect(session.track.ghostRunners.get(7)?.ghostName).toBe('Bob');
        expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('backend/db/ghostdata/');
        expect(GameConfig.ghostIds).toEqual([]);
        // The camera follows the ghost as when racing a track, until the player rides
        const track = session.track;
        expect(track.focalPoint).toBe(track.ghostRunners.get(7)?.instance?.hitbox);
        pressKey('up');
        track.playerRunner.fixedUpdate();
        releaseKey('up');
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
        GameConfig.seed = null;
    });

    test('generates a track from the seed of the host element, then rides it', async () => {
        GameConfig.seed = 1234;
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        GameConfig.seed = null;

        const track = session.track;
        expect(EnduranceCourse.of(track)?.seed).toBe(1234);
        expect(track.layers.main[0].grid.totalSolidLines.size).toBeGreaterThan(10);
        // No checkpoints: another track is another page
        expect(track.toolCollection.getByToolName('New Track')).toBeUndefined();
        expect(track.toolCollection.getByToolName('Cancel Checkpoint')).toBeUndefined();
        expect(track.toolCollection.getByToolName('Eraser')).toBeUndefined();
    });

    test('focuses the ghosts in turn with the toolbar button, as with the shortcut', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent();
        const track = session.track;
        const ghosts = [1, 2].map((id) => {
            const ghost = new GhostRunner(track, '0,,,,,500,BMX,Ghost', false);
            ghost.createBike();
            track.ghostRunners.set(id, ghost);
            return ghost;
        });
        manager.render(createCanvasMock().context);
        // Runner followed by the camera: 0 for the player, then the ghosts, -1 for none
        const followed = () =>
            [track.playerRunner, ...ghosts].findIndex(
                (runner) => runner.instance?.hitbox === track.focalPoint,
            );
        const click = (x: number, y: number) => {
            state?.dispatch('pointerDown', mouseEvent('pointerDown', x, y));
            state?.dispatch('pointerUp', mouseEvent('pointerUp', x, y));
            return followed();
        };
        // Sixth button of the left toolbar, after a gap
        const focusButton = () => click(13, 5 * 26 + 13);

        // The ghosts, then the player again
        expect(followed()).toBe(0);
        expect(focusButton()).toBe(1);
        expect(focusButton()).toBe(2);
        expect(focusButton()).toBe(0);
        expect(focusButton()).toBe(1);

        // Clicking the track itself stops following the bike
        expect(click(350, 250)).toBe(-1);
    });

    test('shows the run, then its result once the rider fell', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent() as TrackEnduranceState;
        for (let frame = 0; frame < 20; frame++) {
            manager.fixedUpdate();
        }
        const { context } = createCanvasMock();
        const texts = () => vi.mocked(context.fillText).mock.calls.map((call) => String(call[0]));

        manager.render(context);
        expect(texts()).toContain('0 m');
        expect(texts().some((text) => text.startsWith('Track '))).toBe(true);

        session.track.playerRunner.crash();
        manager.fixedUpdate();
        manager.render(context);

        expect(state.run?.over).toBe(true);
        expect(texts()).toContain('Enter: try again');
        expect(texts()).toContain('New record!');
    });

    test('rides a new track on the version of the page, e.g. the one in development', async () => {
        GameConfig.version = 2;
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        manager.fixedUpdate();
        const { context } = createCanvasMock();
        manager.render(context);
        GameConfig.version = 1;

        const texts = vi.mocked(context.fillText).mock.calls.map((call) => String(call[0]));
        expect(texts.some((text) => text.endsWith('(v2)'))).toBe(true);
    });

    test('retires the run with its key, or by restarting while riding, saving it', async () => {
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        const state = manager.getCurrent() as TrackEnduranceState;
        // The key of a tool, as the event manager tells it
        const press = (code: string) => {
            const key = code === 'Enter' ? 'Restart' : 'Retire';
            Keyboard.onKeyDown(keyEvent(code, code));
            state.dispatch(
                'keyboardDown',
                EventFactory.createGameEvent({
                    name: 'keyboardDown',
                    consumed: false,
                    keyboardEvent: {} as KeyboardEvent,
                    key,
                }),
            );
            Keyboard.onKeyUp(keyEvent(code, code));
        };
        const ride = () => {
            for (let frame = 0; frame < 20; frame++) {
                manager.fixedUpdate();
            }
        };
        const { context } = createCanvasMock();
        const texts = () => vi.mocked(context.fillText).mock.calls.map((call) => String(call[0]));

        ride();
        press('Backspace');
        expect([state.run?.over, state.run?.retired]).toEqual([true, true]);
        expect(session.track.playerRunner.dead).toBe(true);
        // Not a record: as far as the first run, and slower
        press('Enter');
        ride();
        ride();
        press('Backspace');
        manager.render(context);
        expect(texts()).toContain('Retired');

        // Restarting while riding retires the run first, before the next one starts
        press('Enter');
        ride();
        expect(state.run?.over).toBe(false);
        press('Enter');
        expect([state.run?.over, state.run?.retired]).toEqual([true, true]);
        manager.fixedUpdate();
        expect(state.run?.over).toBe(false);
        expect(session.track.playerRunner.dead).toBe(false);
    });
});

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

describe('Controls panel', () => {
    /** Elements of the interface laid out on a frame, the first one of a class. */
    const element = (className: string) => {
        manager.update(0.5, 20);
        manager.render(createCanvasMock().context);
        const root = manager.getCurrent()?.layers.get('interface')?.uiRenderer.getRootElement();
        const descendants = (parent: UIElement): UIElement[] => [
            parent,
            ...parent.children.flatMap(descendants),
        ];
        return root
            ? descendants(root).find((child) => child.classNames.includes(className))
            : undefined;
    };
    const click = (className: string) => {
        const target = element(className);
        if (!target) throw new Error(`No element .${className}`);
        const bounds = target.getBounds();
        target.handleClick(bounds.x + 1, bounds.y + 1, {} as MouseEvent);
    };
    const press = (key: string, code: string, modifiers: Partial<KeyboardEvent> = {}) => {
        const event = EventFactory.createGameEvent({
            name: 'keyDown',
            consumed: false,
            keyboardEvent: {
                key,
                code,
                ctrlKey: false,
                altKey: false,
                shiftKey: false,
                metaKey: false,
                ...modifiers,
            } as KeyboardEvent,
        });
        manager.getCurrent()?.dispatch('keyDown', event);
        return event.detail.consumed;
    };
    /** Class of the key button of a control, by its label. */
    const keyOf = (label: string) => {
        const entries = ControlCatalog.sections().flatMap((section) => section.entries);
        return `controls-key-${entries.findIndex((entry) => entry.label === label)}`;
    };

    beforeEach(async () => {
        ControlBindings.useStorage(null);
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
    });

    test('binds a control to the next key pressed, the game paused while open', () => {
        const track = session.track;
        track.toolCollection.getByToolName('Controls')?.run();
        expect(track.paused).toBe(true);
        expect(element('controls')).toBeDefined();

        click(keyOf('Accelerate'));
        expect(element(keyOf('Accelerate'))?.v('text')).toBe('Press a key');
        // A modifier alone waits for the key it modifies
        expect(press('Shift', 'ShiftLeft', { shiftKey: true })).toBe(true);
        expect(press('x', 'KeyX')).toBe(true);

        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.up)?.label).toBe('X');
        expect(element(keyOf('Accelerate'))?.v('text')).toBe('X');
        expect(element('controls-message')?.v('text')).toBe('Accelerate: X');

        // Escape closes the panel, the game resuming
        expect(press('Escape', 'Escape')).toBe(true);
        expect(track.controlsOpen).toBe(false);
        expect(track.paused).toBe(false);
        expect(element('controls')).toBeUndefined();
        // Then the keys reach the game again
        expect(press('x', 'KeyX')).toBe(false);
    });

    test('warns of a key running another control, cancels with Escape, and resets the keys', () => {
        const track = session.track;
        track.toolCollection.getByToolName('Controls')?.run();

        click(keyOf('Pause'));
        press('Enter', 'Enter');
        expect(element(keyOf('Pause'))?.v('textColor')).toBe('#b00');
        expect(element('controls-message')?.v('text')).toBe('Enter also runs Restart');

        click(keyOf('Brake'));
        expect(press('Escape', 'Escape')).toBe(true);
        expect(track.controlsOpen).toBe(true);
        expect(element(keyOf('Brake'))?.v('text')).toBe('Down');

        click('controls-reset-all');
        expect(element(keyOf('Pause'))?.v('text')).toBe('Space');
        expect(Keyboard.getControl('Pause')?.label).toBe('Space');

        click('controls-close');
        expect(track.controlsOpen).toBe(false);
    });
});

describe('Racing a track', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                const body = url.includes('trackdata')
                    ? { CODE: RACE_CODE }
                    : { GHOSTSTRING: '0,,,,,500,MTB,Speedy' };
                return new Response(JSON.stringify(body), {
                    headers: { 'content-length': String(JSON.stringify(body).length) },
                });
            }),
        );
    });

    test('downloads the track to race, then races it', async () => {
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);

        expect(session.track.isRace()).toBe(true);
        expect(session.track.targets.size).toBe(1);
        // Only the racing tools are available
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeUndefined();
        expect(session.track.toolCollection.getByToolName('Pause')).toBeDefined();
    });

    test('races the ghosts of a shared link from the start, several of them', async () => {
        GameConfig.ghostIds = [3, 4];
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);
        // The ghosts are downloaded first
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect([...session.track.ghostRunners.keys()].sort()).toEqual([3, 4]);
        expect(GameConfig.ghostIds).toEqual([]);
        const requests = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        expect(requests.filter((url) => url.includes('ghostdata'))).toHaveLength(2);
    });

    test('edits the downloaded track instead when the host element asks for it', async () => {
        GameConfig.editTrack = true;
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        expect(session.trackCode).toBe(RACE_CODE);
        // Edited as a new track: finishing it offers no ghost to save
        expect(session.track.isRace()).toBe(false);
        expect(session.track.targets.size).toBe(1);
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeDefined();
    });

    test('shows the error when the track does not exist', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('false')),
        );
        session.trackId = 404;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_FETCHER);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const { context } = createCanvasMock();

        manager.render(context);

        expect(vi.mocked(context.fillText).mock.calls[0][0]).toBe(
            'Error fetching track: "Track does not exist"',
        );
    });

    test.each([
        [
            'the error of the backend',
            new Response(JSON.stringify({ error: 'Track does not exist' }), { status: 404 }),
            'Track does not exist',
        ],
        [
            'the HTTP status without a JSON error',
            new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }),
            '502 Bad Gateway',
        ],
    ])('shows %s when the request fails', async (_name, response, message) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response),
        );
        session.trackId = 404;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_FETCHER);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const { context } = createCanvasMock();

        manager.render(context);

        expect(vi.mocked(context.fillText).mock.calls[0][0]).toBe(
            `Error fetching track: "${message}"`,
        );
    });

    test('races against the ghosts, sorted by time', async () => {
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);

        await GhostService.toggleGhost(session.track, 3);

        const ghost = session.track.ghostRunners.get(3);
        expect(ghost?.ghostName).toBe('Speedy');
        expect(session.track.focalPoint).toBe(ghost?.instance?.hitbox);
        // Cached: toggling again removes it without downloading it again
        await GhostService.toggleGhost(session.track, 3);
        expect(session.track.ghostRunners.size).toBe(0);
        await GhostService.toggleGhost(session.track, 3);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });
});
