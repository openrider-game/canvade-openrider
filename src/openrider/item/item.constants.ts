import { Boost } from './directional/boost';
import { Gravity } from './directional/gravity';
import { ItemClass } from './item';
import { Teleporter } from './linked/teleporter';
import { Bomb } from './misc/bomb';
import { SlowMo } from './misc/slow-mo';
import { Checkpoint } from './reachable/checkpoint';
import { Target } from './reachable/target';
import { EngineOff } from './status/engine-off';
import { Invincibility } from './status/invincibility';
import { NoSteer } from './status/no-steer';
import { Reset } from './status/reset';
import { Slippery } from './status/slippery';
import { ZeroGravity } from './status/zero-gravity';

/** Item classes that can be read from a track code, by item code. */
export const ITEM_MAP = new Map<string, ItemClass>(
    [
        Bomb,
        SlowMo,
        Boost,
        Checkpoint,
        Gravity,
        Target,
        Teleporter,
        Reset,
        Invincibility,
        Slippery,
        NoSteer,
        EngineOff,
        ZeroGravity,
    ].map((itemClass): [string, ItemClass] => [itemClass.code, itemClass]),
);
