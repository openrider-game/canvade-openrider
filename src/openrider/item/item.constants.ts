import { CommandBlock } from './command/command-block';
import { Boost } from './directional/boost';
import { Gravity } from './directional/gravity';
import { Launcher } from './directional/launcher';
import { ItemClass } from './item';
import { LinkedCheckpoint } from './linked/linked-checkpoint';
import { Teleporter } from './linked/teleporter';
import { Bomb } from './misc/bomb';
import { Mud } from './misc/mud';
import { SlowMo } from './misc/slow-mo';
import { Checkpoint } from './reachable/checkpoint';
import { Target } from './reachable/target';
import { EngineOff } from './status/engine-off';
import { Heavy } from './status/heavy';
import { Invincibility } from './status/invincibility';
import { LowGravity } from './status/low-gravity';
import { Mirror } from './status/mirror';
import { NoSteer } from './status/no-steer';
import { Reset } from './status/reset';
import { Slippery } from './status/slippery';
import { Turbo } from './status/turbo';
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
        LinkedCheckpoint,
        Reset,
        Invincibility,
        Slippery,
        NoSteer,
        EngineOff,
        ZeroGravity,
        Launcher,
        Mud,
        Heavy,
        LowGravity,
        Mirror,
        Turbo,
        CommandBlock,
    ].map((itemClass): [string, ItemClass] => [itemClass.code, itemClass]),
);
