import { Control, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { ControlBindings } from '../../../openrider/controls/control-bindings';
import { ControlCatalog, ControlEntry } from '../../../openrider/controls/control-catalog';
import { ControlsTool } from '../../../openrider/tool/misc/controls.tool';
import type { Track } from '../../../openrider/track/track';
import {
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_DISABLED_TEXT_COLOR,
    UI_PANEL_PADDING,
    UI_ROW_HEIGHT,
    UI_SCROLLBAR_WIDTH,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_SELECTED_TEXT_COLOR,
} from './ui-theme';

const PANEL_WIDTH = 360,
    /** Space kept around the panel on low canvases, in UI pixels. */
    PANEL_MARGIN = 16,
    LABEL_WIDTH = 210,
    KEY_WIDTH = 104,
    RESET_WIDTH = 30,
    /** Text of a key bound to another control of a same screen. */
    CONFLICT_TEXT_COLOR = '#b00',
    SECTION_TEXT_COLOR = '#666';

/**
 * Controls panel of the track states, opened by the controls tool: lists the controls of the game
 * by section (riding, then the tools of each screen) with their keys, to bind them to other keys,
 * the bindings being kept in the browser (see `ControlBindings`).
 *
 * Clicking the key of a control waits for the next key pressed, with its modifiers, Escape
 * cancelling. A key bound to another control of a same screen is shown in red, the message under
 * the list naming the other controls. Each control gets its default key back with its reset
 * button, and every control with the reset all button.
 */
export class ControlsPanel {
    /** Name of the control waiting for its key, null otherwise. */
    private capturing: string | null = null;
    /** Message under the list, e.g. the result of the last binding. */
    private message = '';
    /** Scroll position of the list, kept when the interface is rebuilt. */
    private scrollTop = 0;

    /**
     * Adds the panel to an interface being built: its elements and their styles.
     *
     * @param height - Height of the canvas, in UI pixels.
     */
    public build(
        track: Track,
        structure: UIStructureDefinition,
        styles: UIStyleDefinition,
        height: number,
    ): void {
        const sections = ControlCatalog.sections();
        const rows: UIStructureDefinition = [];
        let index = 0;

        sections.forEach((section, sectionIndex) => {
            rows.push({
                'container.controls-row': [
                    `text.controls-section.controls-section-${sectionIndex}`,
                ],
            });
            styles[`.controls-section-${sectionIndex}`] = { text: section.title };
            for (const entry of section.entries) {
                rows.push(this.row(track, entry, index++, styles));
            }
        });

        structure.push({
            'container.overlay.panel.controls': [
                { 'container.controls-row': ['text.controls-title'] },
                {
                    'container.controls-list': {
                        children: rows,
                        events: { scroll: (scrollTop) => (this.scrollTop = scrollTop) },
                    },
                },
                { 'container.controls-row': ['text.controls-message'] },
                {
                    'container.controls-row.controls-actions': [
                        {
                            'button.controls-reset-all': {
                                events: { click: () => this.resetAll(track) },
                            },
                        },
                        { 'button.controls-close': { events: { click: () => this.close(track) } } },
                    ],
                },
            ],
        });

        // Title, message and actions around the list, in a panel fitting in the canvas
        const fixedHeight = 2 * UI_PANEL_PADDING + 3 * UI_ROW_HEIGHT;
        const listRows = sections.length + index;
        const listHeight = Math.max(
            UI_ROW_HEIGHT,
            Math.min(
                // The rows inside the outline of the list
                listRows * UI_ROW_HEIGHT + 2 * UI_BORDER_WIDTH,
                height - 2 * PANEL_MARGIN - fixedHeight,
            ),
        );
        Object.assign(styles, ControlsPanel.baseStyles());
        styles['.controls'] = { ...styles['.controls'], height: fixedHeight + listHeight };
        styles['.controls-list'] = {
            ...styles['.controls-list'],
            height: listHeight,
            scrollTop: this.scrollTop,
        };
        styles['.controls-message'] = {
            ...styles['.controls-message'],
            text: this.messageText(),
        };
    }

    /**
     * Handles a key pressed while the panel is open: binds the control waiting for a key to it,
     * Escape cancelling, or closes the panel with Escape.
     *
     * @returns Whether the key was taken by the panel, the game not receiving it.
     */
    public handleKey(track: Track, e: KeyboardEvent): boolean {
        if (!track.controlsOpen) {
            this.capturing = null;
            return false;
        }

        if (this.capturing === null) {
            if (e.key === 'Escape') {
                this.close(track);
                return true;
            }
            return false;
        }

        const name = this.capturing;
        if (e.key === 'Escape') {
            this.capturing = null;
            this.message = '';
            track.invalidateUI();
            return true;
        }

        // A modifier alone: waiting for the key it modifies
        const control = Control.fromKeyboardEvent(e);
        if (!control) {
            return true;
        }

        ControlBindings.bind(name, control);
        this.capturing = null;
        const label = this.labelOf(name);
        const conflicts = ControlCatalog.conflicts(name);
        this.message = conflicts.length
            ? `${control.label} also runs ${conflicts.join(', ')}`
            : `${label}: ${control.label}`;
        track.invalidateUI();
        return true;
    }

    /** Row of a control: its label, its key waiting for another one when clicked, its reset. */
    private row(track: Track, entry: ControlEntry, index: number, styles: UIStyleDefinition) {
        const { name, label } = entry;
        const capturing = this.capturing === name;
        const conflicting = !capturing && ControlCatalog.conflicts(name).length > 0;
        const isDefault = ControlBindings.isDefault(name);

        styles[`.controls-label-${index}`] = { text: label };
        styles[`.controls-key-${index}`] = {
            text: capturing ? 'Press a key' : (ControlBindings.label(name) ?? ''),
            ...(capturing
                ? {
                      backgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                      hoverBackgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                      textColor: UI_SELECTED_TEXT_COLOR,
                  }
                : conflicting
                  ? { textColor: CONFLICT_TEXT_COLOR }
                  : {}),
        };
        styles[`.controls-reset-${index}`] = isDefault ? { textColor: UI_DISABLED_TEXT_COLOR } : {};

        return {
            [`container.controls-row.controls-row-${index}`]: [
                `text.controls-label.controls-label-${index}`,
                {
                    [`button.controls-key.controls-key-${index}`]: {
                        events: { click: () => this.capture(track, name) },
                    },
                },
                {
                    [`button.controls-reset.controls-reset-${index}`]: {
                        events: { click: () => this.reset(track, name) },
                    },
                },
            ],
        };
    }

    /** Waits for the key of a control, or stops waiting when clicked again. */
    private capture(track: Track, name: string): void {
        this.capturing = this.capturing === name ? null : name;
        this.message = '';
        track.invalidateUI();
    }

    private reset(track: Track, name: string): void {
        ControlBindings.reset(name);
        this.capturing = null;
        this.message = `${this.labelOf(name)}: ${ControlBindings.label(name)}`;
        track.invalidateUI();
    }

    private resetAll(track: Track): void {
        ControlBindings.resetAll();
        this.capturing = null;
        this.message = 'Every control has its default key';
        track.invalidateUI();
    }

    /** Closes the panel with the controls tool, which resumes the game. */
    private close(track: Track): void {
        this.capturing = null;
        this.message = '';
        track.toolCollection.getByToolName(ControlsTool.toolName)?.run();
    }

    private messageText(): string {
        if (this.capturing !== null) {
            return `Press a key for ${this.labelOf(this.capturing)}, Escape to cancel`;
        }
        return this.message || 'Click a key to bind the control to another one';
    }

    private labelOf(name: string): string {
        const entries = ControlCatalog.sections().flatMap((section) => section.entries);
        return entries.find((entry) => entry.name === name)?.label ?? name;
    }

    private static baseStyles(): UIStyleDefinition {
        const rowWidth = PANEL_WIDTH - 2 * UI_PANEL_PADDING;
        // Rows of the list, beside its scrollbar and inside its outline
        const listRowWidth = rowWidth - UI_SCROLLBAR_WIDTH - 2 * UI_BORDER_WIDTH;
        return {
            '.controls': {
                horizontalAlign: 'center',
                verticalAlign: 'middle',
                width: PANEL_WIDTH,
            },
            '.controls button': { height: UI_ROW_HEIGHT },
            // Texts centered in their row
            '.controls text': { y: 4, height: UI_ROW_HEIGHT - 4 },
            '.controls-title': { width: rowWidth, text: 'Controls', textAlign: 'center' },
            '.controls-list': {
                width: '100%',
                overflow: 'auto',
                scrollbarWidth: UI_SCROLLBAR_WIDTH,
                color: UI_BORDER_COLOR,
                borderWidth: UI_BORDER_WIDTH,
                padding: UI_BORDER_WIDTH,
            },
            '.controls-section': {
                width: listRowWidth,
                color: SECTION_TEXT_COLOR,
                fontSize: 12,
            },
            '.controls-row': {
                pointerEvents: 'none',
                flexDirection: 'row',
                width: rowWidth - UI_SCROLLBAR_WIDTH,
                height: UI_ROW_HEIGHT,
            },
            '.controls-list .controls-row': { width: listRowWidth },
            '.controls-label': { width: LABEL_WIDTH - 2 * UI_BORDER_WIDTH },
            '.controls-key': { width: KEY_WIDTH },
            '.controls-reset': { width: RESET_WIDTH, text: '↺' },
            '.controls-message': { width: rowWidth, fontSize: 12, wrap: 'none' },
            '.controls-actions': { width: '100%' },
            '.controls-reset-all': { width: rowWidth / 2, text: 'Reset all' },
            '.controls-close': { width: rowWidth / 2, text: 'Close' },
        };
    }
}
