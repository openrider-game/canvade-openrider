import { EventFactory, UIElement, UIInput } from 'canvade';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { STATE_TRACK_EDITING, STATE_TRACK_FETCHER } from '../../src/states/state-names';
import { createCanvasMock } from '../helpers/canvas';
import { manager, mouseEvent, runUntil, session, useGame } from './game-helpers';

useGame();

describe('Dialogs of the track', () => {
    /** Renders a frame, returning the texts drawn. */
    const frame = () => {
        const { context } = createCanvasMock();
        manager.update(0.5, 20);
        manager.render(context);
        return vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
    };
    /** Element of the interface, the first one of a class. */
    const element = (className: string) => {
        const root = manager.getCurrent()?.layers.get('interface')?.uiRenderer.getRootElement();
        const descendants = (parent: UIElement): UIElement[] => [
            parent,
            ...parent.children.flatMap(descendants),
        ];
        return root && descendants(root).find((child) => child.classNames.includes(className));
    };
    /** Clicks the middle of an element of the interface with the mouse. */
    const click = (className: string) => {
        const bounds = element(className)?.getBounds();
        if (!bounds) throw new Error(`No element .${className}`);
        const [x, y] = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
        for (const name of ['pointerDown', 'pointerUp'] as const) {
            manager.getCurrent()?.dispatch(name, mouseEvent(name, x, y));
        }
    };
    /** Presses a key, returning whether the game consumed it. */
    const press = (key: string) => {
        const event = EventFactory.createGameEvent({
            name: 'keyDown',
            consumed: false,
            keyboardEvent: {
                key,
                code: key,
                ctrlKey: false,
                altKey: false,
                shiftKey: false,
                metaKey: false,
            } as KeyboardEvent,
        });
        manager.getCurrent()?.dispatch('keyDown', event);
        return event.detail.consumed;
    };

    beforeEach(async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
    });

    test('ask a question over the track, answered with their buttons', async () => {
        const answer = session.track.dialogs.confirm('Delete the layer?', { confirm: 'Delete' });

        expect(frame()).toEqual(expect.arrayContaining(['Delete the layer?', 'Cancel', 'Delete']));
        click('dialog-confirm');

        await expect(answer).resolves.toBe(true);
        expect(session.track.dialogs.current).toBeNull();
        expect(frame()).not.toContain('Delete the layer?');
    });

    test('cover the track, the pointer not reaching the tools', () => {
        void session.track.dialogs.alert('Saved');
        frame();
        const backdrop = element('dialog-backdrop')?.getBounds();

        // The whole canvas of 700x400
        expect(backdrop).toMatchObject({ x: 0, y: 0, width: 700, height: 400 });
        const event = mouseEvent('pointerDown', 20, 380);
        manager.getCurrent()?.dispatch('pointerDown', event);
        expect(event.detail.consumed).toBe(true);
    });

    test('ask for a text, typed in their focused field, Enter confirming', async () => {
        const name = session.track.dialogs.prompt('Name of the template', { maxLength: 6 });
        frame();
        const input = element('dialog-input') as UIInput;
        expect(input.isFocused()).toBe(true);

        for (const key of 'Bridges') {
            expect(press(key)).toBe(true);
        }
        expect(input.value).toBe('Bridge');
        press('Enter');

        await expect(name).resolves.toBe('Bridge');
    });

    test('are cancelled with Escape or their button, no key reaching the controls meanwhile', async () => {
        const first = session.track.dialogs.prompt('First?', { value: 'kept' });
        const second = session.track.dialogs.confirm('Second?');
        frame();
        // The key of the eraser, typed in the field: consumed, it triggers no control
        expect(press('e')).toBe(true);

        press('Escape');
        await expect(first).resolves.toBeNull();
        // The next dialog then
        expect(frame()).toContain('Second?');
        click('dialog-cancel');
        await expect(second).resolves.toBe(false);

        // Once answered, the keys reach the controls again
        expect(press('e')).toBe(false);
    });

    test('tell something, dismissed with Enter or Escape', async () => {
        const told = session.track.dialogs.alert('Your track was refused: too large');
        expect(frame()).not.toContain('Cancel');

        press('Escape');

        await expect(told).resolves.toBeUndefined();
    });
});
