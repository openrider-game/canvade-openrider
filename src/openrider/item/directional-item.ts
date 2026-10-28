import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import { Item, itemPosition } from './item';
import type { ItemShape } from './item-sprite';

/** Constructor and static side of the directional item classes. */
export interface DirectionalItemClass {
    new (pos: Vector, rotation: number, track: Track): DirectionalItem;
    readonly color: string;
}

/** Item pointing in a direction, drawn as a triangle. */
export abstract class DirectionalItem extends Item {
    /** Unit vector the item points to, which subclasses may scale to their effect strength. */
    public readonly direction: Vector;

    /**
     * Creates a directional item.
     *
     * @param rotation - Angle in degrees, 0 pointing down.
     */
    public constructor(
        pos: Vector,
        public readonly rotation: number,
        track: Track,
    ) {
        super(pos, track);

        const rad = (rotation * Math.PI) / 180;
        this.direction = new Vector(-Math.sin(rad), Math.cos(rad));
    }

    public override get sprite(): ItemShape {
        return 'arrow';
    }

    public override get spriteRotation(): number {
        return (this.rotation * Math.PI) / 180;
    }

    /** Same as {@link Item.touch}, with a larger touch radius. */
    public override touch(part: Collidable): void {
        if (part.pos.distanceToSquared(this.pos) < 1000) {
            this.onTouch(part);
        }
    }

    /** The position, then the rotation stored with a 180 degrees offset, in whole degrees. */
    protected override values(): number[] {
        return [...super.values(), Math.trunc(this.rotation - 180)];
    }

    public static override createInstance(values: number[], track: Track): Item {
        const ItemConstructor = this as unknown as DirectionalItemClass;
        return new ItemConstructor(itemPosition(values), (values[2] ?? 0) + 180, track);
    }
}
