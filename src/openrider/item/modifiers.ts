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
    HEAVY: 1 << 5,
    LOW_GRAVITY: 1 << 6,
    MIRROR: 1 << 7,
    TURBO: 1 << 8,
};

/**
 * Effects changing the same factor of the bike, the last one replacing the others: the gravity
 * factor, the engine factor and the steering factor.
 */
export const MODIFIER_GROUPS = {
    GRAVITY: MODIFIERS.ZERO_GRAVITY | MODIFIERS.HEAVY | MODIFIERS.LOW_GRAVITY,
    ENGINE: MODIFIERS.ENGINE_OFF | MODIFIERS.TURBO,
    STEER: MODIFIERS.NO_STEER | MODIFIERS.MIRROR,
};

/** Names of the status effects, by flag of {@link MODIFIERS}. */
const MODIFIER_NAMES: Record<keyof typeof MODIFIERS, string> = {
    INVINCIBILITY: 'invincible',
    NO_STEER: 'no steer',
    SLIPPERY: 'slippery',
    ENGINE_OFF: 'engine off',
    ZERO_GRAVITY: 'zero gravity',
    HEAVY: 'heavy',
    LOW_GRAVITY: 'low gravity',
    MIRROR: 'mirrored',
    TURBO: 'turbo',
};

/** Names of the status effects of a modifiers mask, in the order of {@link MODIFIERS}. */
export function modifierNames(mask: number): string[] {
    return (Object.keys(MODIFIERS) as Array<keyof typeof MODIFIERS>)
        .filter((name) => mask & MODIFIERS[name])
        .map((name) => MODIFIER_NAMES[name]);
}
