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

/** Size of the riding buttons and of the turn button, their gap and margin, in UI pixels. */
const BUTTON_SIZE = 64,
    TURN_SIZE = 44,
    GAP = 10,
    MARGIN = 12,
    /** Highest the buttons go, under the lines of the heads-up display. */
    MIN_TOP = 70;

/** Look of the buttons: half transparent over the track, darker while held. */
const BUTTON_STYLE = {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    hoverBackgroundColor: 'rgba(255, 255, 255, 0.55)',
    focusBackgroundColor: 'rgba(255, 255, 255, 0.55)',
    activeBackgroundColor: 'rgba(0, 0, 0, 0.35)',
    color: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 2,
};

/** A riding button: the player control it holds, its symbol, and its place in a corner. */
interface TouchButton {
    control: string;
    label: string;
    side: 'left' | 'right';
    /** Offset from the side edge, in buttons. */
    column: number;
}

/** Lean back and forward at the bottom left, brake and accelerate at the bottom right. */
const BUTTONS: TouchButton[] = [
    { control: PLAYER_CONTROL_NAMES.left, label: '◀', side: 'left', column: 0 },
    { control: PLAYER_CONTROL_NAMES.right, label: '▶', side: 'left', column: 1 },
    { control: PLAYER_CONTROL_NAMES.down, label: '▼', side: 'right', column: 1 },
    { control: PLAYER_CONTROL_NAMES.up, label: '▲', side: 'right', column: 0 },
];

/**
 * Buttons riding the bike on touch screens, at the bottom corners of the canvas, built into the
 * interface of the track states as UI buttons: each one holds down the player control it stands
 * for while pressed by a finger (see \`Keyboard.press\`), a finger sliding from a button to the
 * next one. The player, the shortcuts and the recorded ghosts thus work as with a keyboard.
 *
 * Hidden until the screen is first touched: a computer without a touch screen never shows them.
 */
export abstract class TouchControls {
    /** Whether the screen was touched, showing the buttons. */
    public static enabled = false;

    /**
     * Structure and styles of the buttons in a canvas of the given height, clear of the
     * interface: their elements and classes are prefixed with \`touch-\`.
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

        const add = (className: string, control: string, label: string, style: object) => {
            structure.push({
                [`button.overlay.touch.${className}`]: {
                    events: {
                        press: () => Keyboard.press(control),
                        release: () => Keyboard.release(control),
                    },
                },
            });
            styles[`.${className}`] = { ...BUTTON_STYLE, text: label, ...style };
        };

        for (const { control, label, side, column } of BUTTONS) {
            const inset = side === 'left' ? insets.left : insets.right;
            const bottomInset = side === 'left' ? insets.bottomLeft : insets.bottomRight;
            add(`touch-${control.toLowerCase()}`, control, label, {
                x: inset + MARGIN + column * (BUTTON_SIZE + GAP),
                y: bottom(bottomInset, BUTTON_SIZE),
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                horizontalAlign: side,
                verticalAlign: 'bottom',
                borderRadius: BUTTON_SIZE / 5,
                fontSize: Math.round(BUTTON_SIZE * 0.4),
            });
        }

        // Turn around, above accelerate
        add('touch-turn', PLAYER_CONTROL_NAMES.turn, '⇄', {
            x: insets.right + MARGIN,
            y: bottom(insets.bottomRight, BUTTON_SIZE) + BUTTON_SIZE + GAP,
            width: TURN_SIZE,
            height: TURN_SIZE,
            horizontalAlign: 'right',
            verticalAlign: 'bottom',
            borderRadius: TURN_SIZE / 5,
            fontSize: Math.round(TURN_SIZE * 0.45),
        });

        return { structure, styles };
    }
}
