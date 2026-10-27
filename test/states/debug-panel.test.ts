import { EventFactory, Mouse, State, StateClass, StateManager, Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Session } from '../../src/states/session';
import { STATE_TRACK_EDITING, STATE_TRACK_FETCHER } from '../../src/states/state-names';
import States from '../../src/states/states';
import { DEBUG_PANEL_X, DEBUG_PANEL_Y } from '../../src/states/track/ui/debug-panel';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';

let manager: StateManager;
let session: Session;

async function startEditing(): Promise<void> {
    manager.push(STATE_TRACK_FETCHER);
    const editing = manager.getState(STATE_TRACK_EDITING);
    for (let frame = 0; frame < 400 && manager.getCurrent() !== editing; frame++) {
        manager.fixedUpdate();
        manager.update(0.5, 20);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/** Runs a frame, rebuilding the interface, and returns the texts drawn. */
function frame(): string[] {
    const { context } = createCanvasMock();
    manager.update(0.5, 20);
    manager.render(context);
    return vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
}

function click(x: number, y: number): void {
    for (const name of ['pointerDown', 'pointerUp'] as const) {
        Mouse.worldPos.set(new Vector(x, y));
        manager.getCurrent()?.dispatch(
            name,
            EventFactory.createGameEvent({
                name,
                consumed: false,
                position: new Vector(x, y),
                pointerEvent: { pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent,
                primary: true,
            }),
        );
    }
    frame();
}

/** Center of a row of the debug panel. */
const row = (index: number) => ({ x: DEBUG_PANEL_X + 50, y: DEBUG_PANEL_Y + 4 + 22 * index + 11 });

beforeEach(() => {
    stubBrowser();
    manager = new StateManager();
    session = new Session(manager.shared);
    for (const { name, state } of Object.values(States)) {
        manager.addState(state as StateClass<State>, name);
    }
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Debug panel', () => {
    test('is displayed with the debug mode, with the stats under it', async () => {
        await startEditing();
        expect(frame()).not.toContain('Grids');

        session.track.toolCollection.getByToolName('Toggle Debug')?.run();
        const texts = frame();

        expect(texts).toEqual(
            expect.arrayContaining(['Grids', 'Bike physics', 'Cache cells', 'Step one tick']),
        );
        expect(texts.some((text) => text.includes('fps'))).toBe(true);
    });

    test('shows or hides each overlay', async () => {
        await startEditing();
        session.track.toolCollection.getByToolName('Toggle Debug')?.run();
        frame();
        const options = session.track.debugOptions;

        // Rows: grids, collisions, item ids, bike physics, cache cells, stats
        click(row(3).x, row(3).y);
        expect(options.bikes).toBe(true);
        click(row(5).x, row(5).y);
        expect(options.stats).toBe(false);
        expect(frame().some((text) => text.includes('fps'))).toBe(false);
    });

    test('runs a single physics tick at a time, pausing the track', async () => {
        await startEditing();
        const track = session.track;
        track.toolCollection.getByToolName('Toggle Debug')?.run();
        frame();
        const time = track.time;
        const hitbox = track.playerRunner.instance?.hitbox;
        const before = hitbox?.displayPos.clone();

        click(row(6).x, row(6).y);
        expect(track.paused).toBe(true);
        for (let i = 0; i < 5; i++) {
            manager.fixedUpdate();
            manager.update(0.5, 20);
        }

        expect(track.time).toBe(time + 1);
        // Displayed at the tick, the bike falling towards the ground
        expect(hitbox?.displayPos).toEqual(hitbox?.pos);
        expect(hitbox?.displayPos.y).not.toBe(before?.y);
    });
});
