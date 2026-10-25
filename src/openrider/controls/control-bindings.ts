import { Control, ControlData, Keyboard } from 'canvade';

/** Key of the bindings in the storage of the browser. */
const STORAGE_KEY = 'openrider.controls';

/** Version of the stored bindings, the bindings of another version being ignored. */
const STORAGE_VERSION = 1;

interface StoredBindings {
    version: number;
    /** Keys bound by the player, by control name. */
    bindings: Record<string, ControlData>;
}

/**
 * Keys of the controls of the game: their default keys, and the ones the player bound them to in
 * the controls panel, kept in the storage of the browser.
 *
 * The controls are registered here instead of directly in canvade's `Keyboard` (see
 * {@link ControlBindings.register}), with the key bound by the player if any. Binding a control
 * again takes effect at once. The storage may be unavailable (private windows, blocked storage):
 * the bindings then only last until the page is closed.
 */
export abstract class ControlBindings {
    /** Default keys of the controls, by name. */
    private static readonly defaults = new Map<string, Control>();
    /** Keys bound by the player, by name, read from the storage on first use. */
    private static bound: Map<string, Control> | null = null;
    private static storage: Storage | null | undefined;

    /**
     * Uses another storage, e.g. in the tests, forgetting the bindings read from the previous one.
     */
    public static useStorage(storage: Storage | null): void {
        ControlBindings.storage = storage;
        ControlBindings.bound = null;
    }

    /** Declares a control and its default key, without registering it in the keyboard. */
    public static declare(name: string, defaultControl: Control): void {
        ControlBindings.defaults.set(name, defaultControl);
    }

    /** Registers a control in the keyboard, with the key the player bound it to, if any. */
    public static register(name: string, defaultControl: Control): void {
        ControlBindings.declare(name, defaultControl);
        Keyboard.registerControl(name, ControlBindings.get(name) ?? defaultControl);
    }

    /** Key of a control: bound by the player, else its default key; null if not declared. */
    public static get(name: string): Control | null {
        return ControlBindings.load().get(name) ?? ControlBindings.defaults.get(name) ?? null;
    }

    /** Readable key of a control, e.g. `Shift+A`, null if not declared. */
    public static label(name: string): string | null {
        return ControlBindings.get(name)?.label ?? null;
    }

    /** Whether a control has its default key. */
    public static isDefault(name: string): boolean {
        return !ControlBindings.load().has(name);
    }

    /**
     * Binds a control to another key, keeping whether it fires once per press, and registers it
     * again in the keyboard if it is registered.
     */
    public static bind(name: string, control: Control): void {
        const defaultControl = ControlBindings.defaults.get(name);
        const bound = new Control(control.codes, control.modifiers, defaultControl?.fireOnce);
        const isDefault =
            defaultControl !== undefined &&
            JSON.stringify(bound.toJSON()) === JSON.stringify(defaultControl.toJSON());

        if (isDefault) {
            ControlBindings.load().delete(name);
        } else {
            ControlBindings.load().set(name, bound);
        }
        ControlBindings.apply(name);
        ControlBindings.save();
    }

    /** Gives a control its default key back. */
    public static reset(name: string): void {
        ControlBindings.load().delete(name);
        ControlBindings.apply(name);
        ControlBindings.save();
    }

    /** Gives every control its default key back. */
    public static resetAll(): void {
        const names = [...ControlBindings.load().keys()];
        ControlBindings.load().clear();
        names.forEach((name) => ControlBindings.apply(name));
        ControlBindings.save();
    }

    /** Registers the current key of a control in the keyboard, if registered there. */
    private static apply(name: string): void {
        const control = ControlBindings.get(name);
        if (control && Keyboard.getControl(name)) {
            Keyboard.registerControl(name, control);
        }
    }

    private static load(): Map<string, Control> {
        if (ControlBindings.bound) {
            return ControlBindings.bound;
        }

        ControlBindings.bound = new Map();
        try {
            const raw = ControlBindings.getStorage()?.getItem(STORAGE_KEY);
            const stored = JSON.parse(raw ?? 'null') as Partial<StoredBindings> | null;
            if (stored?.version === STORAGE_VERSION && stored.bindings) {
                for (const [name, data] of Object.entries(stored.bindings)) {
                    const control = Control.fromJSON(data);
                    if (control) {
                        ControlBindings.bound.set(name, control);
                    }
                }
            }
        } catch {
            // Unreadable or blocked: the default keys
        }
        return ControlBindings.bound;
    }

    private static save(): void {
        const stored: StoredBindings = {
            version: STORAGE_VERSION,
            bindings: Object.fromEntries(
                [...ControlBindings.load()].map(([name, control]) => [name, control.toJSON()]),
            ),
        };
        try {
            ControlBindings.getStorage()?.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {
            // Full or blocked: the bindings last until the page is closed
        }
    }

    /** Storage of the browser, null where it cannot be reached. */
    private static getStorage(): Storage | null {
        if (ControlBindings.storage === undefined) {
            try {
                ControlBindings.storage = typeof localStorage === 'undefined' ? null : localStorage;
            } catch {
                ControlBindings.storage = null;
            }
        }
        return ControlBindings.storage;
    }
}
