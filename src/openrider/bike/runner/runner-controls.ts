/**
 * Names of the runner controls.
 *
 * The order matters: it is the order of the key lists in ghost strings.
 */
export const CONTROL_NAMES = [
    'upPressed',
    'downPressed',
    'leftPressed',
    'rightPressed',
    'turnPressed',
] as const;

/** Name of a runner control. */
export type ControlName = (typeof CONTROL_NAMES)[number];

/** Pressed state of each runner control. */
export type RunnerControls = Record<ControlName, boolean>;

/** Creates control states with every control released. */
export function createControls(): RunnerControls {
    return {
        upPressed: false,
        downPressed: false,
        leftPressed: false,
        rightPressed: false,
        turnPressed: false,
    };
}
