import type { Decor } from './decor';
import { Boulder } from './decors/boulder';
import { Bush } from './decors/bush';
import { Cactus } from './decors/cactus';
import { Cloud } from './decors/cloud';
import { Crystals } from './decors/crystals';
import { Fence } from './decors/fence';
import { Flower } from './decors/flower';
import { Grass } from './decors/grass';
import { IceBlock } from './decors/ice-block';
import { Pine } from './decors/pine';
import { Rock } from './decors/rock';
import { Snowman } from './decors/snowman';
import { SnowyPine } from './decors/snowy-pine';
import { Stalactite } from './decors/stalactite';
import { Stalagmite } from './decors/stalagmite';
import { Tree } from './decors/tree';
import { Tumbleweed } from './decors/tumbleweed';

/** Every decor class, one per file of `decors/`. A new decor is added here. */
const DECOR_CLASSES: ReadonlyArray<new () => Decor> = [
    Boulder,
    Bush,
    Cactus,
    Cloud,
    Crystals,
    Fence,
    Flower,
    Grass,
    IceBlock,
    Pine,
    Rock,
    Snowman,
    SnowyPine,
    Stalactite,
    Stalagmite,
    Tree,
    Tumbleweed,
];

/**
 * Creates the decors by their names, for the biomes naming them (see `biomes/`). A decor drawing
 * from the random generator it is given, a single one of each is created, then shared.
 */
export abstract class DecorFactory {
    private static decors: Map<string, Decor> | null = null;

    /**
     * The decor of a name.
     *
     * @throws When no decor has that name.
     */
    public static create(name: string): Decor {
        const decor = DecorFactory.all().get(name);
        if (!decor) {
            throw new Error(`Unknown decor: ${name}`);
        }
        return decor;
    }

    /** Names of every decor. */
    public static names(): string[] {
        return [...DecorFactory.all().keys()];
    }

    private static all(): Map<string, Decor> {
        DecorFactory.decors ??= new Map(
            DECOR_CLASSES.map((DecorClass) => {
                const decor = new DecorClass();
                return [decor.name, decor];
            }),
        );
        return DecorFactory.decors;
    }
}
