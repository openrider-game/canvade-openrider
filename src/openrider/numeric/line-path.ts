import { Vector } from 'canvade';

/** Polyline drawing helper. */
export abstract class LinePath {
    /**
     * Strokes every step as one polyline, all steps being part of the same path.
     *
     * @param steps - Polylines to stroke, in canvas pixels. Empty polylines are ignored.
     */
    public static render(ctx: CanvasRenderingContext2D, steps: Vector[][]): void {
        ctx.beginPath();
        for (const [first, ...rest] of steps) {
            if (!first) {
                continue;
            }

            ctx.moveTo(first.x, first.y);
            for (const pos of rest) {
                ctx.lineTo(pos.x, pos.y);
            }
        }
        ctx.stroke();
    }
}
