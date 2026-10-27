import { Keyboard, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { PLAYER_CONTROL_NAMES } from '../bike/runner/player-runner';

/** Space taken along the edges by the interface, kept clear by the buttons, in UI pixels. */
export interface TouchInsets {
    /** Width of the toolbar on each side, 0 without one. */
    left: number;
    right: number;
    /** Height of the interface along the bottom edge, on each side, 0 without any. */
    bottomLeft: number;
    bottomRight: number;
}

/** Type of the riding buttons in the UI structures and styles, see `UITouchButton`. */
export const TOUCH_ELEMENT_TYPE = 'touchbutton';

/**
 * Size of the riding buttons and of the turn button, the size of the toolbar buttons on touch
 * screens, and their margin, in UI pixels.
 */
const BUTTON_SIZE = 64,
    TURN_SIZE = 44,
    MARGIN = 12,
    /** Highest the buttons go, under the lines of the heads-up display. */
    MIN_TOP = 70;

/** A riding button: the player control it holds, its icon, and its place in a corner. */
interface TouchButton {
    control: string;
    /** Name of an svg icon of `media/icon`. */
    icon: string;
    side: 'left' | 'right';
    /** Offset from the side edge, in buttons. */
    column: number;
}

/** Lean back and forward at the bottom left, brake and accelerate at the bottom right. */
const BUTTONS: TouchButton[] = [
    { control: PLAYER_CONTROL_NAMES.left, icon: 'lean-back', side: 'left', column: 0 },
    { control: PLAYER_CONTROL_NAMES.right, icon: 'lean-forward', side: 'left', column: 1 },
    { control: PLAYER_CONTROL_NAMES.down, icon: 'brake', side: 'right', column: 1 },
    { control: PLAYER_CONTROL_NAMES.up, icon: 'accelerate', side: 'right', column: 0 },
];

/**
 * Buttons riding the bike on touch screens, at the bottom corners of the canvas, built into the
 * interface of the track states as `UITouchButton`s, looking like the toolbar buttons: each one
 * holds down the player control it stands for while pressed by a finger (see `Keyboard.press`),
 * a finger sliding from a button to the next one. The player, the shortcuts and the recorded
 * ghosts thus work as with a keyboard. The buttons of a corner share their borders, like the
 * toolbar buttons.
 *
 * Shown in touch mode, which also enlarges the interface (see `uiMetrics`): from the start when
 * the main pointer is coarse, e.g. on phones, then following the type of the last pointer pressed,
 * e.g. on a computer with a touch screen. A computer without one never shows them.
 */
export abstract class TouchControls {
    /** Whether the interface is in touch mode, showing the buttons. */
    public static enabled =
        typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    /**
     * Follows the type of a pointer pressed: touch mode with a finger, not with a mouse. A pen
     * keeps the current mode.
     */
    public static follow(pointerType: string): void {
        if (pointerType === 'touch') {
            TouchControls.enabled = true;
        } else if (pointerType === 'mouse') {
            TouchControls.enabled = false;
        }
    }

    /**
     * Structure and styles of the buttons in a canvas of the given height, clear of the
     * interface: their elements and classes are prefixed with `touch-`.
     */
    public static ui(
        height: number,
        insets: TouchInsets,
    ): { structure: UIStructureDefinition; styles: UIStyleDefinition } {
        const structure: UIStructureDefinition = [];
        const styles: UIStyleDefinition = {};
        // Under the lines of the heads-up display on low canvases
        const bottom = (inset: number, size: number) =>
            Math.max(0, Math.min(inset + MARGIN, height - MIN_TOP - size));

        const add = (
            className: string,
            control: string,
            icon: string,
            style: UIStyleDefinition[string],
        ) => {
            structure.push({
                [`${TOUCH_ELEMENT_TYPE}.overlay.touch.${className}`]: {
                    data: { icon },
                    events: {
                        press: () => Keyboard.press(control),
                        release: () => Keyboard.release(control),
                    },
                },
            });
            styles[`.${className}`] = style;
        };

        for (const { control, icon, side, column } of BUTTONS) {
            const inset = side === 'left' ? insets.left : insets.right;
            const bottomInset = side === 'left' ? insets.bottomLeft : insets.bottomRight;
            add(`touch-${control.toLowerCase()}`, control, icon, {
                x: inset + MARGIN + column * BUTTON_SIZE,
                y: bottom(bottomInset, BUTTON_SIZE),
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                horizontalAlign: side,
                verticalAlign: 'bottom',
            });
        }

        // Turn around, on top of accelerate
        add('touch-turn', PLAYER_CONTROL_NAMES.turn, 'turn', {
            x: insets.right + MARGIN,
            y: bottom(insets.bottomRight, BUTTON_SIZE) + BUTTON_SIZE,
            width: TURN_SIZE,
            height: TURN_SIZE,
            horizontalAlign: 'right',
            verticalAlign: 'bottom',
        });

        return { structure, styles };
    }
}
