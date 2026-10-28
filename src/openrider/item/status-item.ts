import type { BikeRunner } from '../bike/runner/bike-runner';
import type { ItemShape } from './item-sprite';
import { ReachableItem } from './reachable-item';

/**
 * Reachable item applying a status effect to the bike, drawn as a square.
 *
 * The effect is applied directly when the item is reached, instead of going through the runner
 * action queue.
 */
export abstract class StatusItem extends ReachableItem {
    /**
     * Sets a status effect in the modifiers of a runner, removing the effects of its group: the
     * effects changing the same factor of the bike replace each other.
     *
     * @param flag - Flag of the effect, see MODIFIERS.
     * @param group - Flags of the effects changing the same factor, see MODIFIER_GROUPS.
     */
    protected static setModifier(runner: BikeRunner, flag: number, group = 0): void {
        runner.modifiersMask = (runner.modifiersMask & ~group) | flag;
    }

    public override get sprite(): ItemShape {
        return 'square';
    }
}
