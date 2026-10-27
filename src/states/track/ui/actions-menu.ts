import { UIButton, UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import type { ButtonDefinition } from '../track-view.definitions';
import { panelHeight, uiMetrics } from './ui-theme';

const MENU_WIDTH = 160,
    /** Offset from the bottom edge of the canvas, like the buttons it holds. */
    MENU_BOTTOM = 10,
    /** Duration of the opening and closing of the menu, like the layers panel, in milliseconds. */
    TOGGLE_DURATION = 200,
    OPEN_LABEL = 'Actions ▼',
    CLOSED_LABEL = 'Actions ▲';

/**
 * Menu holding the buttons of a state at the bottom left of the canvas on touch screens, e.g.
 * Import and Export in the editor, which do not fit side by side with the larger sizes of touch
 * screens (see `uiMetrics`): a panel like the layers panel, right of the left toolbar, whose title
 * button slides the panel up to show the buttons under it, and back down. Running a button closes
 * it.
 *
 * Built into the interface of the `TrackInterfaceLayer`.
 */
export class ActionsMenu {
    /**
     * Called once the menu starts opening or closing, with the duration of its animation, e.g. to
     * move the elements above it along with it.
     */
    public onToggle: ((duration: number) => void) | null = null;
    private open = false;

    /** Buttons the menu holds: the ones at the bottom left, when there are several of them. */
    public static buttonsOf(buttons: ButtonDefinition[]): ButtonDefinition[] {
        const bottomLeft = buttons.filter(
            (button) =>
                (button.horizontalAlign ?? 'left') === 'left' && button.verticalAlign === 'bottom',
        );
        return bottomLeft.length > 1 ? bottomLeft : [];
    }

    /**
     * Adds the menu to an interface being built.
     *
     * @param left - Offset of the menu from the left edge of the canvas, clear of the toolbar.
     */
    public build(
        buttons: ButtonDefinition[],
        left: number,
        structure: UIStructureDefinition,
        styles: UIStyleDefinition,
    ): void {
        const count = buttons.length;
        structure.push({
            'container.overlay.panel.actions': [
                {
                    'button.actions-toggle': {
                        events: { click: (_x, _y, target) => this.toggle(count, target) },
                    },
                },
                // Clipped by the panel while it is closed
                ...buttons.map((button, index) => ({
                    [`button.actions-${index}`]: {
                        events: {
                            click: (_x: number, _y: number, target: UIElement) => {
                                const toggle = target.parent?.children[0];
                                if (toggle) {
                                    this.toggle(count, toggle);
                                }
                                button.action();
                            },
                        },
                    },
                })),
            ],
        });

        const { rowHeight } = uiMetrics();
        styles['.actions'] = {
            x: left,
            y: MENU_BOTTOM,
            width: MENU_WIDTH,
            height: this.height(count),
            verticalAlign: 'bottom',
        };
        styles['.actions button'] = { width: '100%', height: rowHeight };
        buttons.forEach((button, index) => {
            styles[`.actions-${index}`] = { text: button.label };
        });
        styles['.actions-toggle'] = { text: this.open ? OPEN_LABEL : CLOSED_LABEL };
    }

    /** Height the menu takes from the bottom of the canvas, open or closed, in UI pixels. */
    public bottomHeight(buttonCount: number): number {
        return MENU_BOTTOM + this.height(buttonCount);
    }

    private height(buttonCount: number): number {
        return panelHeight(this.open ? buttonCount + 1 : 1);
    }

    /**
     * Opens or closes the menu, animating its height without rebuilding the interface, like the
     * layers panel: the menu stays aligned on the bottom edge, its hidden buttons being clipped.
     *
     * @param toggleButton - Title button of the menu, whose parent is the menu.
     */
    private toggle(buttonCount: number, toggleButton: UIElement): void {
        this.open = !this.open;

        toggleButton.parent?.animate('height', this.height(buttonCount), {
            duration: TOGGLE_DURATION,
        });
        if (toggleButton instanceof UIButton) {
            toggleButton.getProperty('text').setValue(this.open ? OPEN_LABEL : CLOSED_LABEL);
        }
        this.onToggle?.(TOGGLE_DURATION);
    }
}
