import { UIStructureDefinition, UIStyleDefinition, wrapText } from 'canvade';
import type { Dialog } from '../../../openrider/track/track-dialogs';
import type { Track } from '../../../openrider/track/track';
import { measureText } from './text-measure';
import { UI_BACKDROP_COLOR, UI_BORDER_COLOR, uiMetrics } from './ui-theme';

/** Widest dialog, and space kept around it on narrow canvases, in UI pixels. */
const MAX_WIDTH = 360,
    MARGIN = 16,
    PADDING = 12,
    GAP = 10,
    /** Distance between two lines of the message, as a multiple of the font size. */
    LINE_HEIGHT = 1.3;

/**
 * Dialog of a track (see `TrackDialogs`) in the interface of the track states: a panel centered
 * on the canvas, over a shade covering the track, with its message, its text field if it asks for
 * a text, and its buttons, the confirming one at the right. Built last, over everything else.
 *
 * Its text field types with the keyboard of the touch screens too (see `SoftKeyboard`), Enter
 * confirming the dialog; the keys of the dialogs themselves are handled by the interface layer.
 */
export abstract class DialogPanel {
    /** Class of the text field, focused by the interface once built. */
    public static readonly INPUT_CLASS = 'dialog-input';

    /**
     * Adds the dialog shown by a track to an interface being built, if any.
     *
     * @param width - Width of the canvas, in UI pixels.
     */
    public static build(
        track: Track,
        structure: UIStructureDefinition,
        styles: UIStyleDefinition,
        width: number,
    ): void {
        const dialog = track.dialogs.current;
        if (!dialog) {
            return;
        }

        const { fontSize, actionHeight } = uiMetrics();
        const panelWidth = Math.max(160, Math.min(MAX_WIDTH, width - 2 * MARGIN));
        const innerWidth = panelWidth - 2 * PADDING;
        const lines = wrapText(dialog.message, innerWidth, (text) => measureText(text, fontSize));
        const messageHeight = Math.ceil(lines.length * fontSize * LINE_HEIGHT);
        const rows = [messageHeight, ...(dialog.input ? [actionHeight] : []), actionHeight];

        structure.push({ 'container.overlay.dialog-backdrop': [] });
        structure.push({
            'container.overlay.panel.dialog': [
                'text.dialog-message',
                ...(dialog.input ? [DialogPanel.input(track, dialog)] : []),
                {
                    'container.dialog-buttons': [
                        ...(dialog.cancel === null
                            ? []
                            : [
                                  {
                                      'button.dialog-cancel': {
                                          events: { click: () => track.dialogs.answer(false) },
                                      },
                                  },
                              ]),
                        {
                            'button.dialog-confirm': {
                                events: { click: () => track.dialogs.answer(true) },
                            },
                        },
                    ],
                },
            ],
        });

        const buttonWidth = dialog.cancel === null ? innerWidth : (innerWidth - GAP) / 2;
        Object.assign(styles, {
            '.dialog-backdrop': {
                x: 0,
                y: 0,
                width: '100%',
                height: '100%',
                backgroundColor: UI_BACKDROP_COLOR,
            },
            '.dialog': {
                horizontalAlign: 'center',
                verticalAlign: 'middle',
                width: panelWidth,
                height: 2 * PADDING + rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * GAP,
                padding: PADDING,
                gap: GAP,
            },
            '.dialog-message': {
                text: dialog.message,
                color: UI_BORDER_COLOR,
                fontSize,
                lineHeight: LINE_HEIGHT,
                wrap: 'word',
                width: '100%',
                height: messageHeight,
            },
            [`.${DialogPanel.INPUT_CLASS}`]: {
                value: dialog.input?.value ?? '',
                placeholder: dialog.input?.placeholder ?? '',
                maxLength: dialog.input?.maxLength ?? 0,
                width: '100%',
                height: actionHeight,
            },
            '.dialog-buttons': {
                pointerEvents: 'none',
                flexDirection: 'row',
                gap: GAP,
                width: '100%',
                height: actionHeight,
            },
            '.dialog-cancel': {
                text: dialog.cancel ?? '',
                width: buttonWidth,
                height: actionHeight,
            },
            '.dialog-confirm': { text: dialog.confirm, width: buttonWidth, height: actionHeight },
        });
    }

    /** Text field of a dialog asking for a text, keeping the text typed in the dialog. */
    private static input(track: Track, dialog: Dialog): UIStructureDefinition[number] {
        return {
            [`input.${DialogPanel.INPUT_CLASS}`]: {
                events: {
                    change: (value: string) => {
                        if (dialog.input) {
                            dialog.input.value = value;
                        }
                    },
                    submit: (value: string) => {
                        if (dialog.input) {
                            dialog.input.value = value;
                        }
                        track.dialogs.answer(true);
                    },
                },
            },
        };
    }
}
