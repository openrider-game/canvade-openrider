import { Vector } from 'canvade';
import { SimpleItemTool } from './item.tool';

/** Places a status effect item, previewed as a square. */
export abstract class StatusTool extends SimpleItemTool {
    protected override renderPreview(ctx: CanvasRenderingContext2D, pos: Vector): void {
        const zoom = this.track.zoomFactor;
        ctx.fillStyle = this.itemClass.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.beginPath();
        ctx.rect(pos.x - 7 * zoom, pos.y - 7 * zoom, 14 * zoom, 14 * zoom);
        ctx.fill();
        ctx.stroke();
    }
}
