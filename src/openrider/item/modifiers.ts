/**
 * Status effects applied to a runner by status items.
 *
 * Each value is a bit of the runner modifiers mask, which is saved in checkpoints and read by the
 * bike renderers.
 */
export const MODIFIERS = {
    INVINCIBILITY: 1 << 0,
    NO_STEER: 1 << 1,
    SLIPPERY: 1 << 2,
    ENGINE_OFF: 1 << 3,
    ZERO_GRAVITY: 1 << 4,
};
