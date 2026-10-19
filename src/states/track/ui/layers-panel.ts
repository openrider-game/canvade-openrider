import { UIStructureDefinition, UIStyleDefinition } from 'canvade';
import type { Track } from '../../../openrider/track/track';
import type { TrackLayer } from '../../../openrider/track/track-layer';

const PANEL_WIDTH = 230,
    // Offset from the right edge, clear of the right toolbar and of its open groups
    PANEL_RIGHT = 64,
    PANEL_BOTTOM = 10,
    PADDING = 4,
    GAP = 2,
    ROW_HEIGHT = 22,
    SCROLL_HEIGHT = 18,
    /** Number of layer rows displayed at once, the others being reached by scrolling. */
    VISIBLE_ROWS = 6,
    /** Longest layer name displayed in a row, longer names being cut. */
    NAME_LENGTH = 12,
    SELECTED_COLOR = '#bcd',
    DISABLED_COLOR = '#aaa';

/**
 * Layers panel of the editor, at the bottom right of the canvas, built into the interface of the
 * `TrackInterfaceLayer`.
 *
 * Like the layers panel of an image editor, it lists the layers from the top one to the bottom
 * one. A row shows or hides a layer, selects it as the active layer (highlighted), moves it up or
 * down the stack, or removes it; the last main layer cannot be removed. Under the title, an input
 * renames the active layer when Enter is pressed, and the bottom buttons add a main or a
 * foreground layer above the active one. The panel can be collapsed to its title.
 */
export class LayersPanel {
    private open = true;
    /** Number of rows scrolled past, from the top of the list. */
    private scroll = 0;

    /** Adds the panel to an interface being built: its elements and their styles. */
    public build(track: Track, structure: UIStructureDefinition, styles: UIStyleDefinition): void {
        const stack = track.layers;
        const layers = [...stack.all].reverse();
        this.scroll = Math.max(0, Math.min(this.scroll, layers.length - VISIBLE_ROWS));
        const shown = layers.slice(this.scroll, this.scroll + VISIBLE_ROWS);
        const hiddenAbove = this.scroll;
        const hiddenBelow = layers.length - this.scroll - shown.length;
        // The rules of the elements, added below, override these ones of the same specificity
        Object.assign(styles, LayersPanel.baseStyles());

        const content: UIStructureDefinition = [
            { 'button.layers-toggle': { events: { click: () => this.toggle(track) } } },
        ];
        styles['.layers-toggle'] = {
            ...styles['.layers-toggle'],
            text: `Layers (${layers.length}) ${this.open ? '▼' : '▲'}`,
        };
        let height = ROW_HEIGHT;

        if (this.open) {
            content.push({
                'input.layers-name': {
                    events: { submit: (name) => stack.rename(stack.active, name) },
                },
            });
            styles['.layers-name'] = { ...styles['.layers-name'], value: stack.active.name };
            height += GAP + ROW_HEIGHT;

            if (hiddenAbove) {
                content.push(this.scrollButton(track, 'up', -1));
                styles['.layers-scroll-up'] = { text: `▲ ${hiddenAbove} more` };
                height += GAP + SCROLL_HEIGHT;
            }

            shown.forEach((layer, index) => {
                content.push(this.row(track, layer, index, styles));
                height += GAP + ROW_HEIGHT;
            });

            if (hiddenBelow) {
                content.push(this.scrollButton(track, 'down', 1));
                styles['.layers-scroll-down'] = { text: `▼ ${hiddenBelow} more` };
                height += GAP + SCROLL_HEIGHT;
            }

            content.push({
                'container.layers-row.layers-add': [
                    { 'button.layers-add-main': { events: { click: () => stack.add('main') } } },
                    {
                        'button.layers-add-foreground': {
                            events: { click: () => stack.add('foreground') },
                        },
                    },
                ],
            });
            height += GAP + ROW_HEIGHT;
        }

        structure.push({ 'container.overlay.layers': content });
        styles['.layers'] = { ...styles['.layers'], height: height + 2 * PADDING };
    }

    private toggle(track: Track): void {
        this.open = !this.open;
        track.invalidateUI();
    }

    private scrollButton(track: Track, direction: 'up' | 'down', offset: number) {
        return {
            [`button.layers-scroll.layers-scroll-${direction}`]: {
                events: {
                    click: () => {
                        this.scroll += offset;
                        track.invalidateUI();
                    },
                },
            },
        };
    }

    /** Row of a layer, `index` being its position among the displayed rows. */
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
            ...(layer === stack.active ? { backgroundColor: SELECTED_COLOR } : {}),
        };
        styles[`.layers-up-${index}`] = { text: '▲' };
        styles[`.layers-down-${index}`] = { text: '▼' };
        styles[`.layers-delete-${index}`] = {
            text: '✕',
            ...(removable ? {} : { color: DISABLED_COLOR }),
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
        return {
            '.layers': {
                horizontalAlign: 'right',
                verticalAlign: 'bottom',
                x: PANEL_RIGHT,
                y: PANEL_BOTTOM,
                width: PANEL_WIDTH,
                padding: PADDING,
                gap: GAP,
                flexDirection: 'column',
                backgroundColor: '#fff',
                color: '#000',
            },
            '.layers button': { height: ROW_HEIGHT },
            '.layers-toggle': { width: '100%' },
            '.layers-name': { width: '100%', height: ROW_HEIGHT, placeholder: 'Layer name' },
            // More specific than `.layers button`
            '.layers .layers-scroll': { width: '100%', height: SCROLL_HEIGHT },
            '.layers-row': {
                pointerEvents: 'none',
                flexDirection: 'row',
                gap: GAP,
                width: '100%',
                height: ROW_HEIGHT,
            },
            '.layers-visibility': { width: 30 },
            '.layers-select': { width: 112 },
            '.layers-icon': { width: 22 },
            '.layers-add-main': { width: 109, text: '+ Main' },
            '.layers-add-foreground': { width: 109, text: '+ Foreground' },
        };
    }
}
