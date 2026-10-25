import {
    Control,
    KEYE,
    KEYF,
    KEYH,
    KEYI,
    KEYK,
    KEYM,
    KEYN,
    KEYR,
    KEYU,
    KEYZ,
    SHIFT,
} from 'canvade';
import { EngineOff } from '../../item/status/engine-off';
import { Heavy } from '../../item/status/heavy';
import { Invincibility } from '../../item/status/invincibility';
import { LowGravity } from '../../item/status/low-gravity';
import { Mirror } from '../../item/status/mirror';
import { NoSteer } from '../../item/status/no-steer';
import { Reset } from '../../item/status/reset';
import { Slippery } from '../../item/status/slippery';
import { Turbo } from '../../item/status/turbo';
import { ZeroGravity } from '../../item/status/zero-gravity';
import {
    ENGINE_OFF_IMAGE,
    HEAVY_IMAGE,
    INVINCIBILITY_IMAGE,
    LOW_GRAVITY_IMAGE,
    MIRROR_IMAGE,
    NOSTEER_IMAGE,
    RESET_IMAGE,
    SLIPPERY_IMAGE,
    TURBO_IMAGE,
    ZERO_GRAVITY_IMAGE,
} from '../tool.constants';
import { PlaceableItemClass } from './item.tool';
import { StatusTool } from './status.tool';

/** Places a reset status item. */
export class ResetTool extends StatusTool {
    public static override readonly toolName: string = 'Reset';
    public static override readonly keyLabel: string = 'Shift+R';
    public static override readonly key = new Control(KEYR, SHIFT);
    public static override readonly icon = RESET_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Reset;
    }
}

/** Places an invincibility status item. */
export class InvincibilityTool extends StatusTool {
    public static override readonly toolName: string = 'Invincibility';
    public static override readonly keyLabel: string = 'Shift+I';
    public static override readonly key = new Control(KEYI, SHIFT);
    public static override readonly icon = INVINCIBILITY_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Invincibility;
    }
}

/** Places a slippery status item. */
export class SlipperyTool extends StatusTool {
    public static override readonly toolName: string = 'Slippery';
    public static override readonly keyLabel: string = 'Shift+H';
    public static override readonly key = new Control(KEYH, SHIFT);
    public static override readonly icon = SLIPPERY_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Slippery;
    }
}

/** Places a no steer status item. */
export class NoSteerTool extends StatusTool {
    public static override readonly toolName: string = 'No Steer';
    public static override readonly keyLabel: string = 'Shift+N';
    public static override readonly key = new Control(KEYN, SHIFT);
    public static override readonly icon = NOSTEER_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return NoSteer;
    }
}

/** Places an engine off status item. */
export class EngineOffTool extends StatusTool {
    public static override readonly toolName: string = 'Engine Off';
    public static override readonly keyLabel: string = 'Shift+E';
    public static override readonly key = new Control(KEYE, SHIFT);
    public static override readonly icon = ENGINE_OFF_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return EngineOff;
    }
}

/** Places a zero gravity status item. */
export class ZeroGravityTool extends StatusTool {
    public static override readonly toolName: string = 'Zero Gravity';
    public static override readonly keyLabel: string = 'Shift+Z';
    public static override readonly key = new Control(KEYZ, SHIFT);
    public static override readonly icon = ZERO_GRAVITY_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return ZeroGravity;
    }
}

/** Places a heavy status item. */
export class HeavyTool extends StatusTool {
    public static override readonly toolName: string = 'Heavy';
    public static override readonly keyLabel: string = 'Shift+K';
    public static override readonly key = new Control(KEYK, SHIFT);
    public static override readonly icon = HEAVY_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Heavy;
    }
}

/** Places a low gravity status item. */
export class LowGravityTool extends StatusTool {
    public static override readonly toolName: string = 'Low Gravity';
    public static override readonly keyLabel: string = 'Shift+F';
    public static override readonly key = new Control(KEYF, SHIFT);
    public static override readonly icon = LOW_GRAVITY_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return LowGravity;
    }
}

/** Places a mirror status item, swapping the lean controls. */
export class MirrorTool extends StatusTool {
    public static override readonly toolName: string = 'Mirror';
    public static override readonly keyLabel: string = 'Shift+M';
    public static override readonly key = new Control(KEYM, SHIFT);
    public static override readonly icon = MIRROR_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Mirror;
    }
}

/** Places a turbo status item. */
export class TurboTool extends StatusTool {
    public static override readonly toolName: string = 'Turbo';
    public static override readonly keyLabel: string = 'Shift+U';
    public static override readonly key = new Control(KEYU, SHIFT);
    public static override readonly icon = TURBO_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Turbo;
    }
}
