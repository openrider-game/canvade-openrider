import { Display, EventFactory, Mouse, State, StateClass, StateManager, Vector } from 'canvade';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { GameConfig } from '../../src/openrider/config/game-config';
import { TouchControls } from '../../src/openrider/touch/touch-controls';
import { Session } from '../../src/states/session';
import States from '../../src/states/states';
import { stubBrowser } from '../helpers/canvas';

/** The states of the game created as `main.ts` does, shared by the tests of the states. */

export const RACE_CODE = '-50 1i 1k0 1i##T 9c 18###BMX#0 0';

export let manager: StateManager;
export let session: Session;

/** Creates the states of the game, like `main.ts` does. */
export function createGame(): void {
    manager = new StateManager();
    session = new Session(manager.shared);
    for (const { name, state } of Object.values(States)) {
        manager.addState(state as StateClass<State>, name);
    }
}

/** Runs frames until the given state is the current one. */
export async function runUntil(stateName: string, frames = 400): Promise<void> {
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

export function mouseEvent(name: string, x: number, y: number) {
    Mouse.worldPos.set(new Vector(x, y));
    return EventFactory.createGameEvent({
        name,
        consumed: false,
        position: new Vector(x, y),
        pointerEvent: { pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent,
        primary: true,
    });
}

/** Registers the hooks of the tests using these helpers, called at the top of each file. */
export function useGame(): void {
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
}
