import { UIButton, UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import type { Track } from '../../../openrider/track/track';
import { TouchControls } from '../../../openrider/touch/touch-controls';
import type { TrackLayer } from '../../../openrider/track/track-layer';
import {
    UI_DISABLED_TEXT_COLOR,
    UI_PANEL_GAP,
    UI_PANEL_PADDING,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_SELECTED_TEXT_COLOR,
    uiMetrics,
} from './ui-theme';

const PANEL_BOTTOM = 10,
    PADDING = UI_PANEL_PADDING,
    GAP = UI_PANEL_GAP,
    /** Longest layer name displayed in a row, longer names being cut. */
    NAME_LENGTH = 12,
    /** Duration of the opening and closing of the panel, in milliseconds. */
    TOGGLE_DURATION = 200;

/** Sizes of the panel for the current metrics, in UI pixels. */
function panelLayout() {
    const { toolSize, rowHeight, panelWidth, scrollbarWidth } = uiMetrics();
    const visibilityWidth = rowHeight + 8;
    return {
        width: panelWidth,
        // Offset from the right edge, clear of the right toolbar and of its open groups
        right: 2 * toolSize + 12,
        rowHeight,
        scrollbarWidth,
        /** Number of layer rows displayed at once, the others being reached by scrolling. */
        visibleRows: TouchControls.enabled ? 4 : 6,
        visibilityWidth,
        iconWidth: rowHeight,
        /** Width of the layer name buttons, beside the other buttons of a row. */
        selectWidth: panelWidth - 2 * PADDING - visibilityWidth - 3 * rowHeight,
        addWidth: (panelWidth - 2 * PADDING) / 2,
    };
}

/**
 * Layers panel of the editor, at the bottom right of the canvas, built into the interface of the
 * `TrackInterfaceLayer`.
 *
 * Like the layers panel of an image editor, it lists the layers from the top one to the bottom
 * one, in a list scrolling past six layers. A row shows or hides a layer, selects it as the
 * active layer (highlighted), moves it up or down the stack, or removes it; the last main layer
 * cannot be removed. Under the title, an input renames the active layer when Enter is pressed,
 * and the bottom buttons add a main or a foreground layer above the active one. The title button
 * slides the panel down to its title, and back up.
 */
export class LayersPanel {
    /**
     * Called once the panel starts opening or closing, with the duration of its animation, e.g.
     * to move the elements above it along with it.
     */
    public onToggle: ((duration: number) => void) | null = null;
    /** Whether the panel is open, `null` until it is first built: closed on touch screens. */
    private open: boolean | null = null;
    /** Scroll position of the list of layers, kept when the interface is rebuilt. */
    private scrollTop = 0;

    /** Adds the panel to an interface being built: its elements and their styles. */
    public build(track: Track, structure: UIStructureDefinition, styles: UIStyleDefinition): void {
        const stack = track.layers;
        const layers = [...stack.all].reverse();
        const layout = panelLayout();
        const listHeight = Math.min(layers.length, layout.visibleRows) * layout.rowHeight;
        // Leaves the room of the canvas to the track on small screens
        this.open ??= !TouchControls.enabled;
        // The rules of the elements, added below, override these ones of the same specificity
        Object.assign(styles, LayersPanel.baseStyles());

        const content: UIStructureDefinition = [
            {
                'button.layers-toggle': {
                    events: { click: (_x, _y, target) => this.toggle(layers.length, target) },
                },
            },
            {
                'input.layers-name': {
                    events: { submit: (name) => stack.rename(stack.active, name) },
                },
            },
            {
                'container.layers-list': {
                    children: layers.map((layer, index) => this.row(track, layer, index, styles)),
                    events: { scroll: (scrollTop) => (this.scrollTop = scrollTop) },
                },
            },
            {
                'container.layers-row.layers-add': [
                    { 'button.layers-add-main': { events: { click: () => stack.add('main') } } },
                    {
                        'button.layers-add-foreground': {
                            events: { click: () => stack.add('foreground') },
                        },
                    },
                ],
            },
        ];

        styles['.layers-toggle'] = {
            ...styles['.layers-toggle'],
            text: this.toggleLabel(layers.length),
        };
        styles['.layers-name'] = { ...styles['.layers-name'], value: stack.active.name };
        styles['.layers-list'] = {
            ...styles['.layers-list'],
            height: listHeight,
            scrollTop: this.scrollTop,
        };
        // The name buttons leave room for the scrollbar
        if (layers.length > layout.visibleRows) {
            styles['.layers-select'] = { width: layout.selectWidth - layout.scrollbarWidth };
        }

        structure.push({ 'container.overlay.panel.layers': content });
        styles['.layers'] = {
            ...styles['.layers'],
            height: LayersPanel.height(this.open, layers.length),
        };
    }

    /** Height of the panel, open with its rows or closed to its title, in pixels. */
    private static height(open: boolean | null, layerCount: number): number {
        const { rowHeight, visibleRows } = panelLayout();
        if (!open) {
            return 2 * PADDING + rowHeight;
        }
        const listHeight = Math.min(layerCount, visibleRows) * rowHeight;
        return 2 * PADDING + 3 * rowHeight + listHeight + 3 * GAP;
    }

    /** Height the panel takes from the bottom of the canvas, open or closed, in UI pixels. */
    public bottomHeight(track: Track): number {
        const open = this.open ?? !TouchControls.enabled;
        return PANEL_BOTTOM + LayersPanel.height(open, track.layers.all.length);
    }

    private toggleLabel(layerCount: number): string {
        return `Layers (${layerCount}) ${this.open ? '▼' : '▲'}`;
    }

    /**
     * Opens or closes the panel, animating its height without rebuilding the interface: the
     * panel stays aligned on the bottom edge, its hidden rows being clipped.
     *
     * @param toggleButton - Title button of the panel, whose parent is the panel.
     */
    private toggle(layerCount: number, toggleButton: UIElement): void {
        this.open = !this.open;

        const panel = toggleButton.parent;
        panel?.animate('height', LayersPanel.height(this.open, layerCount), {
            duration: TOGGLE_DURATION,
        });
        if (toggleButton instanceof UIButton) {
            toggleButton.getProperty('text').setValue(this.toggleLabel(layerCount));
        }
        this.onToggle?.(TOGGLE_DURATION);
    }

    /** Row of a layer, `index` being its position in the list, from the top layer. */
    private row(track: Track, layer: TrackLayer, index: number, styles: UIStyleDefinition) {
        const stack = track.layers;
        const removable = layer.type === 'foreground' || stack.main.length > 1;
        const name =
            layer.name.length > NAME_LENGTH
                ? `${layer.name.slice(0, NAME_LENGTH - 1)}…`
                : layer.name;

        styles[`.layers-visibility-${index}`] = { text: layer.visible ? 'on' : 'off' };
        styles[`.layers-select-${index}`] = {
            text: layer.type === 'foreground' ? `${name} (fg)` : name,
            ...(layer === stack.active
                ? {
                      backgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                      hoverBackgroundColor: UI_SELECTED_BACKGROUND_COLOR,
                      textColor: UI_SELECTED_TEXT_COLOR,
                  }
                : {}),
        };
        styles[`.layers-up-${index}`] = { text: '▲' };
        styles[`.layers-down-${index}`] = { text: '▼' };
        styles[`.layers-delete-${index}`] = {
            text: '✕',
            ...(removable ? {} : { textColor: UI_DISABLED_TEXT_COLOR }),
        };

        return {
            [`container.layers-row.layers-row-${index}`]: [
                {
                    [`button.layers-visibility.layers-visibility-${index}`]: {
                        events: { click: () => stack.setVisible(layer, !layer.visible) },
                    },
                },
                {
                    [`button.layers-select.layers-select-${index}`]: {
                        events: { click: () => stack.setActive(layer) },
                    },
                },
                {
                    [`button.layers-icon.layers-up-${index}`]: {
                        events: { click: () => stack.move(layer, 1) },
                    },
                },
                {
                    [`button.layers-icon.layers-down-${index}`]: {
                        events: { click: () => stack.move(layer, -1) },
                    },
                },
                {
                    [`button.layers-icon.layers-delete-${index}`]: {
                        events: { click: () => stack.remove(layer) },
                    },
                },
            ],
        };
    }

    private static baseStyles(): UIStyleDefinition {
        const layout = panelLayout();
        return {
            '.layers': {
                horizontalAlign: 'right',
                verticalAlign: 'bottom',
                x: layout.right,
                y: PANEL_BOTTOM,
                width: layout.width,
            },
            '.layers button': { height: layout.rowHeight },
            '.layers-toggle': { width: '100%' },
            '.layers-name': { width: '100%', height: layout.rowHeight, placeholder: 'Layer name' },
            '.layers-list': {
                width: '100%',
                gap: GAP,
                overflow: 'auto',
                scrollbarWidth: layout.scrollbarWidth,
            },
            '.layers-row': {
                pointerEvents: 'none',
                flexDirection: 'row',
                gap: GAP,
                width: '100%',
                height: layout.rowHeight,
            },
            '.layers-visibility': { width: layout.visibilityWidth },
            '.layers-select': { width: layout.selectWidth },
            '.layers-icon': { width: layout.iconWidth },
            '.layers-add-main': { width: layout.addWidth, text: '+ Main' },
            '.layers-add-foreground': { width: layout.addWidth, text: '+ Foreground' },
        };
    }
}
