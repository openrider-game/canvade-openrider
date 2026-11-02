import { EventFactory, Keyboard, UIElement } from 'canvade';
import { beforeEach, describe, expect, test } from 'vitest';
import { PLAYER_CONTROL_NAMES } from '../../src/openrider/bike/runner/player-runner';
import { ControlBindings } from '../../src/openrider/controls/control-bindings';
import { ControlCatalog } from '../../src/openrider/controls/control-catalog';
import { STATE_ENDURANCE_SETUP, STATE_TRACK_ENDURANCE } from '../../src/states/state-names';
import { createCanvasMock } from '../helpers/canvas';
import { manager, session, runUntil, useGame } from './game-helpers';

useGame();

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
