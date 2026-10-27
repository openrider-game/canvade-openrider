import { UIStyleDefinition } from 'canvade';
import { TouchControls } from '../../../openrider/touch/touch-controls';

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
    /** Space between the border of a panel and its rows, in pixels. */
    UI_PANEL_PADDING = 4,
    /**
     * Space between the rows of a panel, in pixels: none, so that adjacent buttons share their
     * border, like the toolbar buttons.
     */
    UI_PANEL_GAP = 0;

/** Sizes of the interface, in UI pixels, see {@link uiMetrics}. */
export interface UIMetrics {
    /** Side of the toolbar buttons, and of the icons drawn in them. */
    toolSize: number;
    iconSize: number;
    /** Height of a row of a panel (options, layers). */
    rowHeight: number;
    /** Width of the panels (options, layers). */
    panelWidth: number;
    /** Width of the scrollbars of the scrolling containers. */
    scrollbarWidth: number;
    /** Width of the `−` and `+` buttons of an option stepping a value. */
    stepWidth: number;
    /** Size of the handle of the options drawer. */
    handleWidth: number;
    handleHeight: number;
    /** Least height of the action buttons, e.g. Import. */
    actionHeight: number;
    /** Font size of the buttons and inputs. */
    fontSize: number;
}

/** Sizes of the interface used with a mouse. */
export const DESKTOP_METRICS: UIMetrics = {
        toolSize: 26,
        iconSize: 24,
        rowHeight: 22,
        panelWidth: 230,
        scrollbarWidth: 8,
        stepWidth: 30,
        handleWidth: 90,
        handleHeight: 20,
        actionHeight: 26,
        fontSize: 14,
    },
    /**
     * Sizes of the interface on touch screens: buttons and rows at least 40 pixels high, close to
     * the touch targets of 44 points advised by Apple and 48 dp by Material Design.
     */
    TOUCH_METRICS: UIMetrics = {
        toolSize: 44,
        iconSize: 40,
        rowHeight: 40,
        panelWidth: 300,
        scrollbarWidth: 20,
        stepWidth: 44,
        handleWidth: 120,
        handleHeight: 36,
        actionHeight: 40,
        fontSize: 16,
    };

/** Sizes of the interface for the current pointer: touch sizes in touch mode. */
export function uiMetrics(): UIMetrics {
    return TouchControls.enabled ? TOUCH_METRICS : DESKTOP_METRICS;
}

/**
 * Styles of the themed elements: the buttons and inputs, and the `panel` containers holding rows
 * of them. Containers are transparent and without border unless they are panels.
 */
const THEME_STYLES: UIStyleDefinition = {
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

/** Styles of the themed elements, with the font size of the current metrics. */
export function themeStyles(): UIStyleDefinition {
    const { fontSize } = uiMetrics();
    return {
        ...THEME_STYLES,
        button: { ...THEME_STYLES['button'], fontSize },
        input: { ...THEME_STYLES['input'], fontSize },
    };
}

/** Height of a panel holding rows of the given height, by default the current one, in pixels. */
export function panelHeight(rows: number, rowHeight = uiMetrics().rowHeight): number {
    return 2 * UI_PANEL_PADDING + rows * rowHeight + Math.max(0, rows - 1) * UI_PANEL_GAP;
}
