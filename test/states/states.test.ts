import {
    Display,
    EventFactory,
    Keyboard,
    Mouse,
    State,
    StateClass,
    StateManager,
    Vector,
} from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostService } from '../../src/openrider/request/ghost-service';
import { TRACK_DEFAULT, TRACK_MODE_RACING } from '../../src/openrider/track/track.constants';
import { Session } from '../../src/states/session';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_GENERATOR,
    STATE_TRACK_PARSER,
    STATE_TRACK_RACING,
} from '../../src/states/state-names';
import States from '../../src/states/states';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { TrackEditingState } from '../../src/states/track/track-editing.state';
import { ToolIcons } from '../../src/states/track/ui/tool-icons';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { keyEvent } from '../helpers/track';

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
        mouseEvent: { button: 0 } as MouseEvent,
    });
}

beforeEach(() => {
    stubBrowser();
    createGame();
});

afterEach(() => {
    Display.pixelRatio = 1;
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
        expect(calls).toContain('clearRect');
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
                key: 'Q',
            }),
        );
        Keyboard.onKeyUp(keyEvent('KeyQ', 'q'));

        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Solid Line');
    });

    test('draws with the mouse, the interface keeping the mouse positions in sync', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Solid Line')?.run();
        const lines = session.track.layers.main[0].grid.totalSolidLines;
        const before = lines.size;

        state?.dispatch('mouseDown', mouseEvent('mouseDown', 300, 200));
        state?.dispatch('mouseMove', mouseEvent('mouseMove', 400, 250));
        state?.dispatch('mouseUp', mouseEvent('mouseUp', 400, 250));

        expect(lines.size).toBe(before + 1);
        const line = [...lines.values()].pop();
        expect(line?.pos).toEqual(new Vector(300, 200));
        expect(line?.endPos).toEqual(new Vector(400, 250));
        expect(session.track.uiHovered).toBe(false);
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
        const layerOption = () => tool.getOptions()[0].label;
        const click = (x: number, y: number) => {
            state?.dispatch('mouseDown', mouseEvent('mouseDown', x, y));
            state?.dispatch('mouseUp', mouseEvent('mouseUp', x, y));
        };

        // Closed: only the handle is reachable, at the top of the canvas
        expect(frames(1)).toContain('Options ▼');
        click(250, 20);
        expect(layerOption()).toBe('Layers: active');

        click(350, 10);
        // Sliding down, the options being still out of reach after one frame
        frames(1);
        click(250, 20);
        expect(layerOption()).toBe('Layers: active');
        expect(frames(15)).toContain('Options ▲');
        click(250, 20);
        expect(layerOption()).toBe('Layers: all visible');

        // Stays open when the options are rebuilt, then closes from the handle under them: a panel
        // of four rows of 22 pixels, inside a padding of 4 pixels
        expect(frames(1)).toContain('Layers: all visible');
        click(350, 2 * 4 + 4 * 22 + 10);
        frames(15);
        click(250, 20);
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

        // Third button of the right toolbar, 26 UI pixels wide, in canvas pixels
        const state = manager.getCurrent();
        state?.dispatch('mouseDown', mouseEvent('mouseDown', 2 * (700 - 13), 2 * (2 * 26 + 13)));
        state?.dispatch('mouseUp', mouseEvent('mouseUp', 2 * (700 - 13), 2 * (2 * 26 + 13)));
        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Solid Line');
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
