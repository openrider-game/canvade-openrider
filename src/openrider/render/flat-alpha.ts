/** Area of a canvas, as `[left, top, right, bottom]` in canvas pixels. */
export type PixelArea = [number, number, number, number];

/** Area around points, in canvas pixels, grown by a padding on each side. */
export function areaAround(points: Iterable<{ x: number; y: number }>, pad: number): PixelArea {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { x, y } of points) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
    }
    return [left - pad, top - pad, right + pad, bottom + pad];
}

/**
 * Drawing state a figure may rely on without setting it, e.g. the round joins and caps the game
 * sets on its canvas: the scratch canvas takes it from the canvas the figure is copied onto.
 */
const INHERITED_STATE = [
    'lineCap',
    'lineJoin',
    'miterLimit',
    'lineWidth',
    'strokeStyle',
    'fillStyle',
    'font',
    'textAlign',
    'textBaseline',
] as const;

/**
 * Draws a translucent figure at a single opacity, e.g. a ghost: the figure is drawn opaque on a
 * scratch canvas, then copied once at the opacity. Its strokes then do not darken where they
 * overlap, e.g. a leg over the frame or the head over the neck: the figure is seen through as a
 * whole, rather than as a pile of translucent strokes.
 */
export abstract class FlatAlpha {
    /** Canvas the figures are drawn on, growing to the largest area drawn. */
    private static scratch: HTMLCanvasElement | null = null;

    /**
     * Draws a figure at an opacity, as one shape. Drawn directly when opaque.
     *
     * @param area - Area the figure is drawn in, nothing outside of it being kept; the whole
     * canvas when null. Only its part on the canvas is drawn: nothing for a figure out of view.
     * @param draw - Draws the figure on a context, at the opacity given.
     */
    public static draw(
        ctx: CanvasRenderingContext2D,
        opacity: number,
        area: PixelArea | null,
        draw: (target: CanvasRenderingContext2D, opacity: number) => void,
    ): void {
        if (opacity >= 1 || typeof document === 'undefined') {
            draw(ctx, opacity);
            return;
        }

        const [left, top, right, bottom] = area ?? [0, 0, ctx.canvas.width, ctx.canvas.height];
        // The track is drawn without transform: the canvas is the area seen
        const x = Math.max(0, Math.floor(left));
        const y = Math.max(0, Math.floor(top));
        const width = Math.min(ctx.canvas.width, Math.ceil(right)) - x;
        const height = Math.min(ctx.canvas.height, Math.ceil(bottom)) - y;
        if (width <= 0 || height <= 0) {
            return;
        }

        const scratch = (FlatAlpha.scratch ??= document.createElement('canvas'));
        if (scratch.width < width || scratch.height < height) {
            scratch.width = Math.max(scratch.width, width);
            scratch.height = Math.max(scratch.height, height);
        }
        const target = scratch.getContext('2d');
        if (!target) {
            draw(ctx, opacity);
            return;
        }

        target.clearRect(0, 0, width, height);
        target.save();
        // As drawn on the canvas directly
        for (const property of INHERITED_STATE) {
            (target as unknown as Record<string, unknown>)[property] = ctx[property];
        }
        target.translate(-x, -y);
        draw(target, 1);
        target.restore();

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(scratch, 0, 0, width, height, x, y, width, height);
        ctx.restore();
    }
}
