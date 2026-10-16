import { ReachableItem } from './reachable-item';

/**
 * Reachable item applying a status effect to the bike, drawn as a square.
 *
 * The effect is applied directly when the item is reached, instead of going through the runner
 * action queue.
 */
export abstract class StatusItem extends ReachableItem {
    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const zoom = this.track.zoomFactor;

        ctx.save();
        ctx.fillStyle = this.reached ? this.reachedColor : this.itemClass.color;
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.rect(pos.x - 7 * zoom, pos.y - 7 * zoom, 14 * zoom, 14 * zoom);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}
