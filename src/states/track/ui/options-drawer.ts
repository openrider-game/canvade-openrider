import { UIButton, UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import type { Track } from '../../../openrider/track/track';
import { panelHeight, UI_PANEL_PADDING, UI_ROW_HEIGHT } from './ui-theme';

const OPTIONS_WIDTH = 230,
    /** Width of the `−` and `+` buttons of an option stepping a value. */
    STEP_WIDTH = 30,
    HANDLE_WIDTH = 90,
    HANDLE_HEIGHT = 20,
    DURATION = 250,
    OPEN_LABEL = 'Options ▲',
    CLOSED_LABEL = 'Options ▼';

/**
 * Drawer of the options of the current tool, built into the interface of the
 * `TrackInterfaceLayer` when the tool has options.
 *
 * A panel like the layers panel, centered at the top of the canvas: hidden above it, it slides
 * down with its handle button, and back up. It stays open or closed when the current tool
 * changes. An option stepping a value has `−` and `+` buttons beside its label.
 */
export class OptionsDrawer {
    private open = false;

    /** Adds the drawer to an interface being built, if the current tool has options. */
    public build(track: Track, structure: UIStructureDefinition, styles: UIStyleDefinition): void {
        const options = track.toolManager.tool?.getOptions() ?? [];
        if (!options.length) {
            return;
        }

        const height = panelHeight(options.length);
        const offsets = this.offsets(height);
        structure.push({
            'container.overlay.panel.options': options.map((option, index) => {
                const button = {
                    [`button.option-${index}`]: { events: { click: () => option.action() } },
                };
                const steps = option.steps;
                return steps
                    ? {
                          [`container.options-row.options-row-${index}`]: [
                              {
                                  [`button.options-step.option-down-${index}`]: {
                                      events: { click: () => steps.down() },
                                  },
                              },
                              button,
                              {
                                  [`button.options-step.option-up-${index}`]: {
                                      events: { click: () => steps.up() },
                                  },
                              },
                          ],
                      }
                    : button;
            }),
        });
        structure.push({
            'button.overlay.options-handle': {
                events: { click: (_x, _y, handle) => this.toggle(handle) },
            },
        });

        // A panel like the layers panel, flush with the top edge of the canvas when open
        styles['.options'] = {
            horizontalAlign: 'center',
            width: OPTIONS_WIDTH,
            y: offsets.options,
            height,
        };
        styles['.options-row'] = {
            pointerEvents: 'none',
            flexDirection: 'row',
            width: '100%',
            height: UI_ROW_HEIGHT,
        };
        styles['.options-handle'] = {
            horizontalAlign: 'center',
            width: HANDLE_WIDTH,
            height: HANDLE_HEIGHT,
            y: offsets.handle,
            text: this.open ? OPEN_LABEL : CLOSED_LABEL,
        };
        // Each button with its own width: a rule for all of them would override these ones
        const labelWidth = OPTIONS_WIDTH - 2 * UI_PANEL_PADDING - 2 * STEP_WIDTH;
        options.forEach((option, index) => {
            const height = UI_ROW_HEIGHT;
            styles[`.option-${index}`] = {
                text: option.label,
                width: option.steps ? labelWidth : '100%',
                height,
            };
            if (option.steps) {
                styles[`.option-down-${index}`] = { text: '−', width: STEP_WIDTH, height };
                styles[`.option-up-${index}`] = { text: '+', width: STEP_WIDTH, height };
            }
        });
    }

    /**
     * Opens or closes the drawer, sliding the options and the handle together.
     *
     * The interface is not rebuilt: a rebuild during the animation applies its end position.
     *
     * @param handle - Handle button, a sibling of the options panel.
     */
    private toggle(handle: UIElement): void {
        this.open = !this.open;

        const options = handle.parent?.children.find((child) =>
            child.classNames.includes('options'),
        );
        if (!options || !(handle instanceof UIButton)) {
            return;
        }

        const offsets = this.offsets(options.v('height'));
        options.animate('y', offsets.options, { duration: DURATION });
        handle.animate('y', offsets.handle, { duration: DURATION });
        handle.getProperty('text').setValue(this.open ? OPEN_LABEL : CLOSED_LABEL);
    }

    /**
     * Vertical offsets of the options and of the handle: an open drawer hangs from the top edge
     * of the canvas with the handle under it, a closed drawer is right above the canvas with the
     * handle at its top edge.
     *
     * @param height - Height of the options panel.
     */
    private offsets(height: number): { options: number; handle: number } {
        return this.open ? { options: 0, handle: height } : { options: -height, handle: 0 };
    }
}
