import { Control, CTRL, Keyboard, KEYM, KEYN, KEYW, KEYZ, SHIFT } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PLAYER_CONTROL_NAMES } from '../../src/openrider/bike/runner/player-runner';
import { ControlBindings } from '../../src/openrider/controls/control-bindings';
import { ControlCatalog } from '../../src/openrider/controls/control-catalog';
import { PauseTool } from '../../src/openrider/tool/misc/pause.tool';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';

/** Storage double, as the one of the browser. */
function memoryStorage(items = new Map<string, string>()): Storage {
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
}

let items: Map<string, string>;

beforeEach(() => {
    stubBrowser();
    items = new Map();
    ControlBindings.useStorage(memoryStorage(items));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Control bindings', () => {
    test('register the controls with the keys bound by the player, else their default keys', () => {
        items.set(
            'openrider.controls',
            JSON.stringify({
                version: 1,
                bindings: { [PLAYER_CONTROL_NAMES.up]: new Control(KEYW).toJSON() },
            }),
        );
        ControlBindings.useStorage(memoryStorage(items));
        // The player registers the riding controls
        new Track(null);

        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.up)?.label).toBe('W');
        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.down)?.label).toBe('Down');
        expect(ControlBindings.isDefault(PLAYER_CONTROL_NAMES.up)).toBe(false);
    });

    test('bind a control again at once, keeping it firing once, and save it', () => {
        new Track(null);
        ControlBindings.bind(PLAYER_CONTROL_NAMES.turn, new Control(KEYM, SHIFT));

        const turn = Keyboard.getControl(PLAYER_CONTROL_NAMES.turn);
        expect(turn?.label).toBe('Shift+M');
        expect(turn?.fireOnce).toBe(true);
        expect(JSON.parse(items.get('openrider.controls') ?? '{}').bindings).toEqual({
            [PLAYER_CONTROL_NAMES.turn]: { codes: ['KeyM'], modifiers: SHIFT, fireOnce: true },
        });

        // Bound to its default key: nothing to keep
        ControlBindings.bind(PLAYER_CONTROL_NAMES.turn, new Control(KEYZ));
        expect(ControlBindings.isDefault(PLAYER_CONTROL_NAMES.turn)).toBe(true);
        expect(JSON.parse(items.get('openrider.controls') ?? '{}').bindings).toEqual({});
    });

    test('give the controls their default keys back, one or all of them', () => {
        new Track(null);
        ControlBindings.bind(PLAYER_CONTROL_NAMES.up, new Control(KEYW));
        ControlBindings.bind(PLAYER_CONTROL_NAMES.down, new Control(KEYN));

        ControlBindings.reset(PLAYER_CONTROL_NAMES.up);
        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.up)?.label).toBe('Up');
        expect(ControlBindings.isDefault(PLAYER_CONTROL_NAMES.down)).toBe(false);

        ControlBindings.resetAll();
        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.down)?.label).toBe('Down');
        expect(JSON.parse(items.get('openrider.controls') ?? '{}').bindings).toEqual({});
    });

    test('ignore the bindings of another version, unreadable ones, and a missing storage', () => {
        items.set(
            'openrider.controls',
            JSON.stringify({ version: 99, bindings: { Up: new Control(KEYW).toJSON() } }),
        );
        ControlBindings.useStorage(memoryStorage(items));
        expect(ControlBindings.isDefault('Up')).toBe(true);

        items.set('openrider.controls', 'not json');
        ControlBindings.useStorage(memoryStorage(items));
        expect(ControlBindings.isDefault('Up')).toBe(true);

        ControlBindings.useStorage(null);
        new Track(null);
        ControlBindings.bind(PLAYER_CONTROL_NAMES.up, new Control(KEYW));
        expect(Keyboard.getControl(PLAYER_CONTROL_NAMES.up)?.label).toBe('W');
    });

    test('show the key bound to a tool in its tooltip', () => {
        const pause = new PauseTool(new Track(null));
        pause.registerControls();
        expect(pause.getKeyLabel()).toBe('Space');

        ControlBindings.bind(PauseTool.toolName, new Control(KEYN, CTRL));
        expect(pause.getKeyLabel()).toBe('Control+N');
        expect(Keyboard.getControl(PauseTool.toolName)?.label).toBe('Control+N');
    });
});

describe('Control catalog', () => {
    test('lists riding, then the tools of each screen once, each one with a default key', () => {
        const sections = ControlCatalog.sections();
        const names = sections.flatMap((section) => section.entries.map((entry) => entry.name));

        expect(sections.map((section) => section.title)).toEqual([
            'Riding',
            'Racing',
            'Endurance',
            'Editor',
        ]);
        expect(sections[0].entries.map((entry) => entry.label)).toEqual([
            'Accelerate',
            'Brake',
            'Lean back',
            'Lean forward',
            'Turn around',
        ]);
        expect(new Set(names).size).toBe(names.length);
        // The tools of the groups too
        expect(names).toContain('Item Group');
        expect(names).toContain('Command Block');
        expect(names).toContain('Mirror');
        expect(
            sections[3].entries.find((entry) => entry.name === 'Undo')?.defaultControl.label,
        ).toBe('M');
    });

    test('has no conflict with the default keys', () => {
        const names = ControlCatalog.sections().flatMap((section) =>
            section.entries.map((entry) => entry.name),
        );
        expect(names.filter((name) => ControlCatalog.conflicts(name).length > 0)).toEqual([]);
    });

    test('tells the conflicts of a key on a same screen only', () => {
        // N runs Redo in the editor and New Track in endurance mode, never on a same screen
        ControlBindings.bind('Undo', new Control(KEYN));
        expect(ControlCatalog.conflicts('Undo')).toEqual(['Redo']);
        expect(ControlCatalog.conflicts('New Track')).toEqual([]);

        // Pausing is possible on every screen
        ControlBindings.bind('Pause', new Control(KEYN));
        expect(ControlCatalog.conflicts('Pause')).toEqual(['New Track', 'Undo', 'Redo']);

        // As riding
        ControlBindings.bind(PLAYER_CONTROL_NAMES.up, new Control(KEYM));
        expect(ControlCatalog.conflicts('Mirror')).toEqual([]);
        ControlBindings.bind('Mirror', new Control(KEYM));
        expect(ControlCatalog.conflicts('Mirror')).toEqual(['Accelerate']);
    });
});
