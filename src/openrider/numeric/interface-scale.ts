import { Display } from 'canvade';

/**
 * Draws interface elements in UI pixels, like the canvade UI, so that they keep their size on
 * high density screens (see the canvade `Display`).
 */
export abstract class InterfaceScale {
    /**
     * Calls `draw` with the context scaled to UI pixels, and the size of the canvas in UI pixels.
     *
     * @param origin - Canvas position, in canvas pixels, that becomes the origin of the drawing.
     */
    public static draw(
        ctx: CanvasRenderingContext2D,
        draw: (width: number, height: number) => void,
        origin?: { x: number; y: number },
    ): void {
        const scale = Display.uiScale;
        ctx.save();
        if (origin) {
            ctx.translate(origin.x, origin.y);
        }
        ctx.scale(scale, scale);
        try {
            draw(ctx.canvas.width / scale, ctx.canvas.height / scale);
        } finally {
            ctx.restore();
        }
    }
}
