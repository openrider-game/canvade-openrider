import { EventFactory, Keyboard } from 'canvade';
import { describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { LATEST_GENERATOR_VERSION } from '../../src/openrider/endurance/terrain/versions';
import { STATE_ENDURANCE_SETUP, STATE_TRACK_ENDURANCE } from '../../src/states/state-names';
import { TrackEnduranceState } from '../../src/states/endurance/track-endurance.state';
import { EnduranceCourse } from '../../src/openrider/endurance/endurance-course';
import { createCanvasMock } from '../helpers/canvas';
import { keyEvent, pressKey, releaseKey } from '../helpers/track';
import { manager, session, runUntil, mouseEvent, useGame } from './game-helpers';

useGame();

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

    test('shows the run, then its result once the rider fell, with a button to try again', async () => {
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
        // The panel of the result is built on the next update
        manager.update(0.5, 20);
        manager.render(context);

        expect(state.run?.over).toBe(true);
        expect(texts()).toContain('Try again (Enter)');
        expect(texts()).toContain('New record!');

        // The button, at the bottom of the panel of 142 pixels centered on the canvas of 700x400
        for (const name of ['pointerDown', 'pointerUp'] as const) {
            state.dispatch(name, mouseEvent(name, 350, 200 + 71 - 12 - 13));
        }
        manager.fixedUpdate();
        expect(state.run?.over).toBe(false);
        const { context: next } = createCanvasMock();
        manager.update(0.5, 20);
        manager.render(next);
        const nextTexts = vi.mocked(next.fillText).mock.calls.map((call) => String(call[0]));
        expect(nextTexts).not.toContain('Try again (Enter)');
    });

    test('rides a new track on the version of the page, e.g. an older one', async () => {
        GameConfig.version = 1;
        manager.push(STATE_ENDURANCE_SETUP);
        await runUntil(STATE_TRACK_ENDURANCE);
        manager.fixedUpdate();
        const { context } = createCanvasMock();
        manager.render(context);
        GameConfig.version = LATEST_GENERATOR_VERSION;

        const texts = vi.mocked(context.fillText).mock.calls.map((call) => String(call[0]));
        expect(texts.some((text) => text.endsWith('(v1)'))).toBe(true);
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
        manager.update(0.5, 20);
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
