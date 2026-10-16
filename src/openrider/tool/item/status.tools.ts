import { Control, KEYE, KEYH, KEYI, KEYN, KEYR, SHIFT } from 'canvade';
import { EngineOff } from '../../item/status/engine-off';
import { Invincibility } from '../../item/status/invincibility';
import { NoSteer } from '../../item/status/no-steer';
import { Reset } from '../../item/status/reset';
import { Slippery } from '../../item/status/slippery';
import {
    ENGINE_OFF_IMAGE,
    INVINCIBILITY_IMAGE,
    NOSTEER_IMAGE,
    RESET_IMAGE,
    SLIPPERY_IMAGE,
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
