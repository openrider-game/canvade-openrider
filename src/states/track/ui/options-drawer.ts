import {
    UIButton,
    UIElement,
    UIStructureDefinition,
    UIStyleDefinition,
    UIStyleProperties,
} from 'canvade';
import type { OptionSwatches, ToolOption } from '../../../openrider/tool/tool';
import type { Track } from '../../../openrider/track/track';
import {
    panelHeight,
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_PANEL_PADDING,
    uiMetrics,
} from './ui-theme';

const DURATION = 250,
    OPEN_LABEL = 'Options ▲',
    CLOSED_LABEL = 'Options ▼',
    /** Colored buttons on each row of an option with swatches. */
    SWATCHES_PER_ROW = 8,
    /** Border of the selected swatch, thicker than the others, marked with a check. */
    SELECTED_SWATCH_BORDER_WIDTH = 4,
    SELECTED_SWATCH_TEXT = '✓';

/**
 * Drawer of the options of the current tool, built into the interface of the
 * `TrackInterfaceLayer` when the tool has options.
 *
 * A panel like the layers panel, centered at the top of the canvas: hidden above it, it slides
 * down with its handle button, and back up. It stays open or closed when the current tool
 * changes. An option stepping a value has `−` and `+` buttons beside its label, and an option
 * with swatches is rows of buttons filled with its colors instead.
 */
export class OptionsDrawer {
    private open = false;

    /** Adds the drawer to an interface being built, if the current tool has options. */
    public build(track: Track, structure: UIStructureDefinition, styles: UIStyleDefinition): void {
        const options = track.toolManager.tool?.getOptions() ?? [];
        if (!options.length) {
            return;
        }

        const metrics = uiMetrics();
        const rows = options.reduce((total, option) => total + OptionsDrawer.rowCount(option), 0);
        const height = panelHeight(rows);
        const offsets = this.offsets(height);
        structure.push({
            'container.overlay.panel.options': options.flatMap((option, index) =>
                OptionsDrawer.optionRows(option, index),
            ),
        });
        structure.push({
            'button.overlay.options-handle': {
                events: { click: (_x, _y, handle) => this.toggle(handle) },
            },
        });

        // A panel like the layers panel, flush with the top edge of the canvas when open
        styles['.options'] = {
            horizontalAlign: 'center',
            width: metrics.panelWidth,
            y: offsets.options,
            height,
        };
        styles['.options-row'] = {
            pointerEvents: 'none',
            flexDirection: 'row',
            width: '100%',
            height: metrics.rowHeight,
        };
        styles['.options-handle'] = {
            horizontalAlign: 'center',
            width: metrics.handleWidth,
            height: metrics.handleHeight,
            y: offsets.handle,
            text: this.open ? OPEN_LABEL : CLOSED_LABEL,
        };
        // Each button with its own width: a rule for all of them would override these ones
        const { stepWidth, rowHeight } = metrics;
        const innerWidth = metrics.panelWidth - 2 * UI_PANEL_PADDING;
        options.forEach((option, index) => {
            if (option.swatches) {
                Object.assign(
                    styles,
                    OptionsDrawer.swatchStyles(option.swatches, index, innerWidth, rowHeight),
                );
                return;
            }
            styles[`.option-${index}`] = {
                text: option.label,
                width: option.steps ? innerWidth - 2 * stepWidth : '100%',
                height: rowHeight,
            };
            if (option.steps) {
                styles[`.option-down-${index}`] = {
                    text: '−',
                    width: stepWidth,
                    height: rowHeight,
                };
                styles[`.option-up-${index}`] = { text: '+', width: stepWidth, height: rowHeight };
            }
        });
    }

    /** Number of rows of an option in the panel. */
    private static rowCount(option: ToolOption): number {
        return option.swatches ? Math.ceil(option.swatches.colors.length / SWATCHES_PER_ROW) : 1;
    }

    /** Rows of an option: its button, with its steps if any, or its rows of swatches. */
    private static optionRows(option: ToolOption, index: number): UIStructureDefinition {
        const { steps, swatches } = option;
        if (swatches) {
            return OptionsDrawer.swatchRows(swatches, index);
        }

        const button = {
            [`button.option-${index}`]: { events: { click: () => option.action() } },
        };
        if (!steps) {
            return [button];
        }
        return [
            {
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
            },
        ];
    }

    /** Rows of swatches, {@link SWATCHES_PER_ROW} on each, selecting their color on a click. */
    private static swatchRows(swatches: OptionSwatches, index: number): UIStructureDefinition {
        const rows: UIStructureDefinition = [];
        for (let start = 0; start < swatches.colors.length; start += SWATCHES_PER_ROW) {
            const end = Math.min(start + SWATCHES_PER_ROW, swatches.colors.length);
            const buttons: UIStructureDefinition = [];
            for (let color = start; color < end; color++) {
                buttons.push({
                    [`button.option-${index}-swatch-${color}`]: {
                        events: { click: () => swatches.select(color) },
                    },
                });
            }
            rows.push({
                [`container.options-row.options-row-${index}-${start / SWATCHES_PER_ROW}`]: buttons,
            });
        }
        return rows;
    }

    /**
     * Styles of the swatches: buttons filled with their color, hovered or not, sharing the width
     * of a row. The selected one has a thicker border and a check.
     */
    private static swatchStyles(
        swatches: OptionSwatches,
        index: number,
        rowWidth: number,
        rowHeight: number,
    ): UIStyleDefinition {
        const styles: UIStyleDefinition = {};
        swatches.colors.forEach((color, swatch) => {
            const selected = swatch === swatches.selected;
            const style: UIStyleProperties = {
                width: rowWidth / SWATCHES_PER_ROW,
                height: rowHeight,
                backgroundColor: color,
                hoverBackgroundColor: color,
                focusBackgroundColor: color,
                activeBackgroundColor: color,
                color: UI_BORDER_COLOR,
                borderWidth: selected ? SELECTED_SWATCH_BORDER_WIDTH : UI_BORDER_WIDTH,
                text: selected ? SELECTED_SWATCH_TEXT : '',
            };
            styles[`.option-${index}-swatch-${swatch}`] = style;
        });
        return styles;
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
