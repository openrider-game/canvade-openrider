import { Control, KEYB, KEYC, KEYG, KEYO, KEYS, KEYT, KEYW, SHIFT } from 'canvade';
import { Boost } from '../../item/directional/boost';
import { Gravity } from '../../item/directional/gravity';
import { DirectionalItemClass } from '../../item/directional-item';
import { LinkedItemClass } from '../../item/linked-item';
import { Teleporter } from '../../item/linked/teleporter';
import { Bomb } from '../../item/misc/bomb';
import { SlowMo } from '../../item/misc/slow-mo';
import { Checkpoint } from '../../item/reachable/checkpoint';
import { Target } from '../../item/reachable/target';
import {
    BOMB_IMAGE,
    BOOST_IMAGE,
    CHECKPOINT_IMAGE,
    GRAVITY_IMAGE,
    SLOWMO_IMAGE,
    TARGET_IMAGE,
    TELEPORTER_IMAGE,
} from '../tool.constants';
import { DirectionalItemTool } from './directional-item.tool';
import { PlaceableItemClass, SimpleItemTool } from './item.tool';
import { LinkedItemTool } from './linked-item.tool';

/** Places a target. */
export class TargetTool extends SimpleItemTool {
    public static override readonly toolName: string = 'Target';
    public static override readonly keyLabel: string = 'Shift+T';
    public static override readonly key = new Control(KEYT, SHIFT);
    public static override readonly icon = TARGET_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Target;
    }
}

/** Places a checkpoint. */
export class CheckpointTool extends SimpleItemTool {
    public static override readonly toolName: string = 'Checkpoint';
    public static override readonly keyLabel: string = 'Shift+C';
    public static override readonly key = new Control(KEYC, SHIFT);
    public static override readonly icon = CHECKPOINT_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Checkpoint;
    }
}

/** Places a bomb. */
export class BombTool extends SimpleItemTool {
    public static override readonly toolName: string = 'Bomb';
    public static override readonly keyLabel: string = 'Shift+O';
    public static override readonly key = new Control(KEYO, SHIFT);
    public static override readonly icon = BOMB_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return Bomb;
    }
}

/** Places a slow-motion item. */
export class SlowMoTool extends SimpleItemTool {
    public static override readonly toolName: string = 'Slow-Motion';
    public static override readonly keyLabel: string = 'Shift+S';
    public static override readonly key = new Control(KEYS, SHIFT);
    public static override readonly icon = SLOWMO_IMAGE;

    protected get itemClass(): PlaceableItemClass {
        return SlowMo;
    }
}

/** Places a boost. */
export class BoostTool extends DirectionalItemTool {
    public static override readonly toolName: string = 'Boost';
    public static override readonly keyLabel: string = 'Shift+B';
    public static override readonly key = new Control(KEYB, SHIFT);
    public static override readonly icon = BOOST_IMAGE;

    protected get itemClass(): DirectionalItemClass {
        return Boost;
    }
}

/** Places a gravity item. */
export class GravityTool extends DirectionalItemTool {
    public static override readonly toolName: string = 'Gravity';
    public static override readonly keyLabel: string = 'Shift+G';
    public static override readonly key = new Control(KEYG, SHIFT);
    public static override readonly icon = GRAVITY_IMAGE;

    protected get itemClass(): DirectionalItemClass {
        return Gravity;
    }
}

/** Places a pair of teleporters. */
export class TeleporterTool extends LinkedItemTool {
    public static override readonly toolName: string = 'Teleporter';
    public static override readonly keyLabel: string = 'Shift+W';
    public static override readonly key = new Control(KEYW, SHIFT);
    public static override readonly icon = TELEPORTER_IMAGE;

    protected get itemClass(): LinkedItemClass {
        return Teleporter;
    }
}
