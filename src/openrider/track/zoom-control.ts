import type { Vector } from 'canvade';
import type { Track } from './track';
import { CAMERA_FOLLOW_FACTOR, ZOOM_SETTLE_TIME } from './track.constants';
import { Zoom } from './zoom';

/**
 * Zoom of the view of a track: the zoom of the player, changed by steps (see
 * {@link ZoomControl.zoomAt}), and the zooms the command blocks ease the view to for a while
 * (see {@link ZoomControl.zoomTo}). Also tells when the zoom settled, the images of the track
 * being rendered at the zoom then.
 *
 * The zoom itself is the pixel zoom of the track, `Track.zoomFactor`.
 */
export class ZoomControl {
    /**
     * View zoom the view eases to: the zoom of a command block, or back to the zoom of the player;
     * null once reached.
     */
    public target: number | null = null;
    /**
     * Zoom a command block holds the view at until a physics tick of the run of the player, and
     * the zoom of the player the view goes back to then, as view zooms; null without one.
     */
    public hold: { zoom: number; until: number; back: number } | null = null;
    /** Pixel zoom of the last frame, null before the first one, see {@link follow}. */
    private seen: number | null = null;
    /** Time the pixel zoom last changed at, in milliseconds (`performance.now`). */
    private changedAt = -Infinity;

    public constructor(private readonly track: Track) {}

    /**
     * Notes the pixel zoom of a frame, to tell when it settles (see {@link settled}): called once
     * per frame by the renderer.
     */
    public follow(): void {
        const zoomFactor = this.track.zoomFactor;
        if (this.seen !== null && this.seen !== zoomFactor) {
            this.changedAt = performance.now();
        }
        this.seen = zoomFactor;
    }

    /**
     * Whether the zoom settled: unchanged for {@link ZOOM_SETTLE_TIME}, and not easing to the zoom
     * of a command block. While it changes, the images of the track are scaled rather than drawn
     * again at each zoom (see `RenderCell.getImage`).
     */
    public get settled(): boolean {
        return this.target === null && performance.now() - this.changedAt >= ZOOM_SETTLE_TIME;
    }

    /**
     * Zooms the view as a command block asks, for a duration: the view then goes back to the zoom
     * of the player, the one before the first block of a series.
     *
     * @param zoom - View zoom, as the zoom levels of the player.
     * @param duration - Duration, in physics ticks.
     * @param time - Time of the run of the player, in physics ticks.
     */
    public zoomTo(zoom: number, duration: number, time: number): void {
        // The zoom of the player: kept through the blocks following each other
        const back = this.hold?.back ?? this.target ?? this.track.viewZoom;
        this.hold = { zoom, until: time + duration, back };
        this.target = zoom;
    }

    /** Ends the zoom of a command block, the view going back to the zoom of the player. */
    public release(): void {
        if (this.hold) {
            this.target = this.hold.back;
            this.hold = null;
        }
    }

    /**
     * Eases the zoom to the one a command block asked for at the speed of the camera, and back to
     * the zoom of the player once its duration is over.
     */
    public ease(delta: number): void {
        const track = this.track;
        if (this.hold && track.time >= this.hold.until) {
            this.release();
        }
        if (this.target === null) {
            return;
        }

        const target = Zoom.toPixel(this.target, track.pixelRatio);
        const gap = target - track.zoomFactor;
        if (Math.abs(gap) < target * 0.001) {
            track.zoomFactor = target;
            this.target = null;
        } else {
            track.zoomFactor += gap * Math.min(1, delta * CAMERA_FOLLOW_FACTOR);
        }
    }

    /**
     * Zooms in or out by steps of the view zoom, keeping the given point at the same place on the
     * canvas: the player takes the zoom back from the command blocks.
     *
     * @param point - World position to zoom at.
     * @param direction - Number of zoom steps, positive to zoom in, negative to zoom out.
     */
    public zoomAt(point: Vector, direction: number): void {
        const track = this.track;
        this.target = null;
        this.hold = null;
        const pixel = track.toPixel(point);
        track.zoomFactor = Zoom.toPixel(Zoom.step(track.viewZoom, direction), track.pixelRatio);
        track.camera.x = point.x - (pixel.x - track.viewWidth / 2) / track.zoomFactor;
        track.camera.y = point.y - (pixel.y - track.viewHeight / 2) / track.zoomFactor;
    }
}
