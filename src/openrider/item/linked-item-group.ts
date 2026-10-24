import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import type { LinkedItem, LinkedItemClass } from './linked-item';
import { ReachableItem } from './reachable-item';

/**
 * Group of linked items.
 *
 * The group is never placed on the track itself, but adds, removes and exports all its items
 * at once. It is also what the track parser returns for a linked item code, so that adding it
 * adds all its items.
 */
export class LinkedItemGroup extends ReachableItem {
    public readonly instances: LinkedItem[] = [];

    public constructor(track: Track) {
        super(new Vector(), track);
    }

    /** Adds every item of the group on the layer of the group. */
    public override addToTrack(): void {
        for (const instance of this.instances) {
            instance.layer = this.layer;
            instance.addToTrack(true);
        }
    }

    public override removeFromTrack(): void {
        for (const instance of this.instances) {
            instance.removeFromTrack(true);
        }
    }

    /**
     * Exports the group as one item code, followed by the coordinates of each item.
     *
     * @param code - Item letter of the group items.
     */
    public serialize(code: string): string {
        let serialized = code;
        for (const instance of this.instances) {
            instance.recorded = true;
            // Strips the item code, keeping the coordinates
            serialized += instance.toString(true).substring(code.length);
        }
        return serialized;
    }

    public override toString(): string {
        return this.serialize(this.instances[0]?.itemClass.code ?? '');
    }

    /**
     * Reaches the group when one of its items is touched, once per run.
     *
     * The player marks every item as reached, while ghosts never mark them: the reached sets
     * and the action queue of their runner tell instead whether they already reached the group.
     * Every item is queued for the runner, then the touched item effect is applied towards each
     * other item of the group.
     */
    public touchFrom(part: Collidable, touchedInstance: LinkedItem): void {
        const runner = part.bike.runner;

        // A ghost replays the run of the player, so it must reach the group exactly when the
        // player did: otherwise it is teleported back by the other teleporter, and its run
        // diverges
        const reached = runner.isGhost
            ? this.instances.some(
                  (instance) =>
                      runner.actionQueue.has(instance.id) ||
                      runner.reachablesReached.has(instance.id),
              )
            : this.reached;
        if (reached) {
            return;
        }

        if (!runner.isGhost) {
            this.reached = true;
        }
        for (const instance of this.instances) {
            if (!runner.isGhost) {
                instance.reached = true;
            }
            if (!runner.reachablesReached.has(instance.id)) {
                runner.actionQueue.set(instance.id, instance);
            }
        }

        this.onReach(part);
        for (const other of this.instances) {
            if (other !== touchedInstance) {
                touchedInstance.onReach(part, other);
            }
        }
    }

    /**
     * Creates a group and its items from a group code.
     *
     * @param itemCode - Group code split on spaces: the item letter, then the arguments of each
     * item one after the other.
     */
    public static createGroup(
        itemCode: string[],
        track: Track,
        itemClass: LinkedItemClass,
    ): LinkedItemGroup {
        const itemGroup = new LinkedItemGroup(track);

        for (let itemIndex = 0; itemIndex < itemClass.itemCount; itemIndex++) {
            const itemCodeArguments = [itemCode[0]];
            for (let argumentIndex = 1; argumentIndex <= itemClass.argumentCount; argumentIndex++) {
                itemCodeArguments.push(
                    itemCode[itemIndex * itemClass.argumentCount + argumentIndex],
                );
            }

            const instance = itemClass.createInstance(itemCodeArguments, track, true) as LinkedItem;
            instance.group = itemGroup;

            itemGroup.instances.push(instance);
        }

        return itemGroup;
    }
}
