import type { BikeRunner } from '../bike/runner/bike-runner';
import type { Collidable } from '../entity/collidable';
import { Item } from './item';

/**
 * Item that is reached once per run, such as targets and checkpoints.
 *
 * Only the player marks the item as reached: ghosts trigger it on every touch, their progress
 * being tracked by the reached sets of their own runner.
 */
export abstract class ReachableItem extends Item {
    /** Fill color of the item once reached. */
    public static readonly reachedColor: string = '#fff';

    /** Whether the player reached the item during the current run, reset on restart. */
    public reached = false;

    protected get reachedColor(): string {
        return (this.constructor as typeof ReachableItem).reachedColor;
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const zoom = this.track.zoomFactor;

        ctx.save();
        ctx.fillStyle = this.reached ? this.reachedColor : this.itemClass.color;
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.moveTo(pos.x + 7 * zoom, pos.y);
        ctx.arc(pos.x, pos.y, 7 * zoom, 0, 2 * Math.PI, true);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    /** Reaches the item, unless the player already did or it is already queued for the runner. */
    protected override onTouch(part: Collidable): void {
        const runner = part.bike.runner;

        if (runner.isGhost || !this.reached) {
            if (!runner.isGhost) {
                this.reached = true;
            }
            if (!runner.actionQueue.has(this.id)) {
                this.onReach(part);
            }
        }
    }

    /**
     * Applies the item effect.
     *
     * By default the item is queued, unless the runner already reached it, so that the runner
     * processes it at the start of its next physics tick, once every part is updated.
     *
     * @param _linkedItem - The other item of the group, for linked items.
     */
    public onReach(part: Collidable, _linkedItem?: ReachableItem): void {
        if (!part.bike.runner.reachablesReached.has(this.id)) {
            part.bike.runner.actionQueue.set(this.id, this);
        }
    }

    /** Records the item as reached by the runner, called when processing its action queue. */
    public reachBy(runner: BikeRunner): void {
        runner.hitReachable(this);
    }

    public override resetReached(): void {
        this.reached = false;
    }

    protected override onAdd(): void {
        super.onAdd();
        this.track.reachables.set(this.id, this);
    }

    protected override onDelete(): void {
        super.onDelete();
        this.track.reachables.delete(this.id);
    }
}
