import {
    Display,
    GamePinchEvent,
    GamePointerEvent,
    GameRenderEvent,
    GameWheelEvent,
    Layer,
    Vector,
} from 'canvade';
import { LiveEditSession } from '../../../openrider/live/live-edit-session';
import { TrackRenderer } from '../../../openrider/track/track-renderer';
import type { TrackViewState } from '../track-view.state';

/** Ratio of the distance between two fingers zooming in or out by one step. */
const PINCH_STEP = 1.25;

/**
 * Bottom layer of the track states: renders the track and the current tool, forwards to the tool
 * the primary pointer (the mouse, or a single finger) when the layers above did not consume it,
 * and moves the view with two fingers on touch screens: dragging it, and pinching to zoom.
 */
export class TrackMainLayer extends Layer {
    /** Center of the pinch, in canvas pixels, and its scale at the last zoom step. */
    private pinch: { center: Vector; scale: number } | null = null;

    /** The debug overlays are displayed when the state allows them (see `allowsDebug`). */
    public constructor(private readonly state: TrackViewState) {
        super();
    }

    public initLayer(): void {
        this.subscribe('render', this.renderTrack);
        this.subscribe('pointerDown', this.onToolPointerDown);
        this.subscribe('pointerUp', this.onToolPointerUp);
        this.subscribe('pointerMove', this.onToolPointerMove);
        this.subscribe('scroll', this.onToolScroll);
        this.subscribe('contextMenu', this.onToolContextMenu);
        this.subscribe('pointerEnter', this.onPointerIn);
        this.subscribe('pointerLeave', this.onPointerLeave);
        this.subscribe('pinchStart', this.onPinchStart);
        this.subscribe('pinchMove', this.onPinchMove);
        this.subscribe('pinchEnd', this.onPinchEnd);
    }

    private renderTrack(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        const track = this.state.track;
        // The track reads the canvas size to compute its view, and is drawn in device pixels
        track.canvas = ctx.canvas;
        track.setPixelRatio(Display.pixelRatio);

        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#000';
        ctx.lineWidth = 1;

        TrackRenderer.render(ctx, track, {
            debug: this.state.allowsDebug() && track.debug,
            hideHiddenLayers: this.state.editsLayers(),
        });
        track.toolManager.render(ctx);
        LiveEditSession.of(track)?.renderCursors(ctx);
        ctx.restore();

        // The cursor of the current tool is replaced while the interface is hovered
        ctx.canvas.style.cursor = track.uiHovered ? 'pointer' : track.cursor;
    }

    private onToolPointerDown(e: CustomEvent<GamePointerEvent>): void {
        if (e.detail.primary) {
            this.state.track.toolManager.onMouseDown(e.detail.pointerEvent);
        }
    }

    private onToolPointerUp(e: CustomEvent<GamePointerEvent>): void {
        if (e.detail.primary) {
            this.state.track.toolManager.onMouseUp(e.detail.pointerEvent);
        }
    }

    private onToolPointerMove(e: CustomEvent<GamePointerEvent>): void {
        if (e.detail.primary) {
            this.state.track.toolManager.onMouseMove(e.detail.pointerEvent);
        }
    }

    private onToolScroll(e: CustomEvent<GameWheelEvent>): void {
        this.state.track.toolManager.onScroll(e.detail.wheelEvent);
    }

    private onToolContextMenu(): void {
        this.state.track.toolManager.onContextMenu();
    }

    /** Stops following the bike, as dragging the view with the mouse does. */
    private onPinchStart(e: CustomEvent<GamePinchEvent>): void {
        this.state.track.focalPoint = null;
        this.pinch = { center: e.detail.center, scale: 1 };
    }

    /**
     * Drags the view with the center of the fingers, and zooms around it by a step each time
     * the fingers get closer or further by {@link PINCH_STEP}.
     */
    private onPinchMove(e: CustomEvent<GamePinchEvent>): void {
        const pinch = this.pinch;
        if (!pinch) {
            return;
        }

        const track = this.state.track;
        const { center, scale } = e.detail;
        track.camera.selfSub(center.sub(pinch.center).scale(1 / track.zoomFactor));
        pinch.center = center;

        while (scale > pinch.scale * PINCH_STEP) {
            pinch.scale *= PINCH_STEP;
            track.zoomAt(track.toWorld(center), 1);
        }
        while (scale < pinch.scale / PINCH_STEP) {
            pinch.scale /= PINCH_STEP;
            track.zoomAt(track.toWorld(center), -1);
        }
    }

    private onPinchEnd(): void {
        this.pinch = null;
    }

    /** The primary pointer entering the canvas, the only one entering and leaving it. */
    private onPointerIn(): void {
        this.state.track.mouseIn = true;
    }

    private onPointerLeave(): void {
        this.state.track.mouseIn = false;
    }
}
