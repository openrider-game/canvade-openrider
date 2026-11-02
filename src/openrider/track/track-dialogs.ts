import type { Track } from './track';

/** Text field of a dialog asking for a text, see {@link TrackDialogs.prompt}. */
export interface DialogInput {
    /** Text the field starts with, then the text typed. */
    value: string;
    placeholder: string;
    /** Number of characters at most, 0 for no limit. */
    maxLength: number;
}

/** A dialog shown over the track, answered with one of its buttons. */
export interface Dialog {
    message: string;
    /** Label of the button confirming. */
    confirm: string;
    /** Label of the button cancelling, null for a dialog only telling something. */
    cancel: string | null;
    /** Text field of the dialog, null without. */
    input: DialogInput | null;
}

/** Labels of the buttons of a dialog, and the field of a dialog asking for a text. */
export interface DialogOptions {
    confirm?: string;
    cancel?: string;
    value?: string;
    placeholder?: string;
    maxLength?: number;
}

/** A dialog waiting for its answer. */
interface PendingDialog extends Dialog {
    resolve(confirmed: boolean): void;
}

/**
 * Dialogs of a track, in place of the dialogs of the browser (`alert`, `confirm`, `prompt`):
 * drawn on the canvas with the interface of the track states, so that they work the same in
 * fullscreen and on touch screens, the keyboard of a phone typing in their text field.
 *
 * Each method shows a dialog and resolves once it is answered; dialogs asked meanwhile wait for
 * their turn. The interface shows {@link TrackDialogs.current} and answers it with
 * {@link TrackDialogs.answer}.
 */
export class TrackDialogs {
    private readonly queue: PendingDialog[] = [];

    public constructor(private readonly track: Track) {}

    /** Dialog shown, the first one waiting, null without. */
    public get current(): Dialog | null {
        return this.queue[0] ?? null;
    }

    /** Tells something, resolving once dismissed. */
    public async alert(message: string, options: DialogOptions = {}): Promise<void> {
        await this.show({ message, confirm: options.confirm ?? 'OK', cancel: null, input: null });
    }

    /** Asks a question, resolving with whether it was confirmed. */
    public confirm(message: string, options: DialogOptions = {}): Promise<boolean> {
        return this.show({
            message,
            confirm: options.confirm ?? 'OK',
            cancel: options.cancel ?? 'Cancel',
            input: null,
        });
    }

    /** Asks for a text, resolving with the text typed, or null when cancelled. */
    public async prompt(message: string, options: DialogOptions = {}): Promise<string | null> {
        const input: DialogInput = {
            value: options.value ?? '',
            placeholder: options.placeholder ?? '',
            maxLength: options.maxLength ?? 0,
        };
        const confirmed = await this.show({
            message,
            confirm: options.confirm ?? 'OK',
            cancel: options.cancel ?? 'Cancel',
            input,
        });
        return confirmed ? input.value : null;
    }

    /**
     * Answers the dialog shown, confirming it or cancelling it, the text typed being in its
     * input: the next dialog waiting is shown.
     */
    public answer(confirmed: boolean): void {
        const dialog = this.queue.shift();
        if (!dialog) {
            return;
        }
        this.track.invalidateUI();
        dialog.resolve(confirmed);
    }

    private show(dialog: Dialog): Promise<boolean> {
        return new Promise((resolve) => {
            this.queue.push({ ...dialog, resolve });
            this.track.invalidateUI();
        });
    }
}
