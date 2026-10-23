import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './track.constants';

/**
 * Zoom levels of a track. The player chooses a view zoom, in CSS pixels per world unit, by steps
 * of {@link ZOOM_STEP} between {@link MIN_ZOOM} and {@link MAX_ZOOM}; the track is drawn at the
 * pixel zoom, in canvas pixels per world unit, which is the view zoom multiplied by the pixel
 * ratio of the screen. The track thus keeps its size on high density screens, drawn at their
 * full resolution.
 */
export abstract class Zoom {
    /** Pixel zoom of a view zoom, rounded so that it can key the cached images. */
    public static toPixel(viewZoom: number, pixelRatio: number): number {
        return Math.round(viewZoom * pixelRatio * 10000) / 10000;
    }

    /** View zoom of a pixel zoom, rounded to the steps precision. */
    public static toView(pixelZoom: number, pixelRatio: number): number {
        return Zoom.round(pixelZoom / pixelRatio);
    }

    /** Next view zoom by steps, clamped to the zoom bounds. */
    public static step(viewZoom: number, steps: number): number {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Zoom.round(viewZoom + ZOOM_STEP * steps)));
    }

    /** Whether a view zoom is within the zoom bounds. */
    public static isValid(viewZoom: number): boolean {
        return viewZoom >= MIN_ZOOM && viewZoom <= MAX_ZOOM;
    }

    /** View zooms from the minimum zoom to a maximum one, by steps. */
    public static levels(maxViewZoom: number): number[] {
        const levels: number[] = [];
        for (let zoom = MIN_ZOOM; zoom <= maxViewZoom; zoom = Zoom.round(zoom + ZOOM_STEP)) {
            levels.push(zoom);
        }
        return levels;
    }

    private static round(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
