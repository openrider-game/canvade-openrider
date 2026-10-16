import { Vector } from 'canvade';
import type { Collidable } from '../entity/collidable';
import type { Track } from '../track/track';
import { Item, parseItemPosition } from './item';

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

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const zoom = this.track.zoomFactor;

        ctx.save();
        ctx.fillStyle = this.itemClass.color;
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        DirectionalItem.traceArrow(ctx, zoom);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Traces the item triangle around the origin of the context, pointing down.
     *
     * @param zoom - Track zoom factor, the triangle being sized in world units.
     */
    public static traceArrow(ctx: CanvasRenderingContext2D, zoom: number): void {
        ctx.moveTo(-7 * zoom, -10 * zoom);
        ctx.lineTo(0, 10 * zoom);
        ctx.lineTo(7 * zoom, -10 * zoom);
        ctx.lineTo(-7 * zoom, -10 * zoom);
    }

    /** Same as {@link Item.touch}, with a larger touch radius. */
    public override touch(part: Collidable): void {
        if (part.pos.distanceToSquared(this.pos) < 1000) {
            this.onTouch(part);
        }
    }

    /** Serializes the item, the rotation being stored in base 32 with a 180 degrees offset. */
    public override toString(): string {
        this.recorded = true;
        const rotation = (this.rotation - 180).toString(32);
        return `${this.itemClass.code} ${this.pos.toString()} ${rotation}`;
    }

    public static override createInstance(itemCode: string[], track: Track): Item {
        const ItemConstructor = this as unknown as DirectionalItemClass;
        return new ItemConstructor(
            parseItemPosition(itemCode),
            parseInt(itemCode[3], 32) + 180,
            track,
        );
    }
}
