import { UIStyleDefinition } from 'canvade';

/**
 * Look shared by the whole interface of the game, after the toolbar buttons: white square
 * elements with a black border, darker while hovered or pressed.
 */
export const UI_BACKGROUND_COLOR = '#fff',
    UI_HOVER_BACKGROUND_COLOR = '#ddd',
    UI_ACTIVE_BACKGROUND_COLOR = '#ccc',
    UI_BORDER_COLOR = '#000',
    /** Border width of the buttons, inputs and panels, in pixels. */
    UI_BORDER_WIDTH = 2,
    /** Background of the selected tool or layer, with light text. */
    UI_SELECTED_BACKGROUND_COLOR = '#456',
    UI_SELECTED_TEXT_COLOR = '#fff',
    /** Background of an enabled toggle tool. */
    UI_TOGGLED_BACKGROUND_COLOR = '#077',
    /** Text of an action that cannot be done. */
    UI_DISABLED_TEXT_COLOR = '#999',
    /** Height of a row of a panel (options, layers), in pixels. */
    UI_ROW_HEIGHT = 22,
    /** Width of the scrollbars of the scrolling containers, in pixels. */
    UI_SCROLLBAR_WIDTH = 8,
    /** Space between the border of a panel and its rows, in pixels. */
    UI_PANEL_PADDING = 4,
    /**
     * Space between the rows of a panel, in pixels: none, so that adjacent buttons share their
     * border, like the toolbar buttons.
     */
    UI_PANEL_GAP = 0;

/**
 * Styles of the themed elements: the buttons and inputs, and the `panel` containers holding rows
 * of them. Containers are transparent and without border unless they are panels.
 */
export const THEME_STYLES: UIStyleDefinition = {
    button: {
        backgroundColor: UI_BACKGROUND_COLOR,
        hoverBackgroundColor: UI_HOVER_BACKGROUND_COLOR,
        focusBackgroundColor: UI_BACKGROUND_COLOR,
        activeBackgroundColor: UI_ACTIVE_BACKGROUND_COLOR,
        color: UI_BORDER_COLOR,
        borderRadius: 0,
        borderWidth: UI_BORDER_WIDTH,
    },
    input: {
        backgroundColor: UI_BACKGROUND_COLOR,
        color: UI_BORDER_COLOR,
        borderWidth: UI_BORDER_WIDTH,
    },
    container: {
        color: 'transparent',
        scrollbarColor: UI_SELECTED_BACKGROUND_COLOR,
        scrollbarTrackColor: UI_HOVER_BACKGROUND_COLOR,
    },
    '.panel': {
        backgroundColor: UI_BACKGROUND_COLOR,
        color: UI_BORDER_COLOR,
        borderWidth: UI_BORDER_WIDTH,
        padding: UI_PANEL_PADDING,
        gap: UI_PANEL_GAP,
        flexDirection: 'column',
    },
};

/** Height of a panel holding rows of {@link UI_ROW_HEIGHT}, in pixels. */
export function panelHeight(rows: number): number {
    return 2 * UI_PANEL_PADDING + rows * UI_ROW_HEIGHT + Math.max(0, rows - 1) * UI_PANEL_GAP;
}
