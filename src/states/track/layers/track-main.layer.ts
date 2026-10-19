import { GameMouseEvent, GameRenderEvent, GameWheelEvent, Layer } from 'canvade';
import { TrackRenderer } from '../../../openrider/track/track-renderer';
import type { TrackViewState } from '../track-view.state';

/**
 * Bottom layer of the track states: renders the track and the current tool, and forwards to the
 * tool the mouse events the layers above did not consume.
 */
export class TrackMainLayer extends Layer {
    /**
     * @param debugEnabled - Whether the debug overlay can be displayed in this state.
     */
    public constructor(
        private readonly state: TrackViewState,
        private readonly debugEnabled = true,
    ) {
        super();
    }

    public initLayer(): void {
        this.subscribe('render', this.renderTrack);
        this.subscribe('mouseDown', this.onToolMouseDown);
        this.subscribe('mouseUp', this.onToolMouseUp);
        this.subscribe('mouseMove', this.onToolMouseMove);
        this.subscribe('scroll', this.onToolScroll);
        this.subscribe('contextMenu', this.onToolContextMenu);
        this.subscribe('mouseEnter', this.onMouseIn);
        this.subscribe('mouseOut', this.onMouseLeave);
    }

    private renderTrack(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        const track = this.state.track;
        // The track reads the canvas size to compute its view
        track.canvas = ctx.canvas;

        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#000';
        ctx.lineWidth = 1;

        TrackRenderer.render(ctx, track, {
            debug: this.debugEnabled && track.debug,
            hideHiddenLayers: this.state.editsLayers(),
        });
        track.toolManager.render(ctx);
        ctx.restore();

        // The cursor of the current tool is replaced while the interface is hovered
        ctx.canvas.style.cursor = track.uiHovered ? 'pointer' : track.cursor;
    }

    private onToolMouseDown(e: CustomEvent<GameMouseEvent>): void {
        this.state.track.toolManager.onMouseDown(e.detail.mouseEvent);
    }

    private onToolMouseUp(e: CustomEvent<GameMouseEvent>): void {
        this.state.track.toolManager.onMouseUp(e.detail.mouseEvent);
    }

    private onToolMouseMove(e: CustomEvent<GameMouseEvent>): void {
        this.state.track.toolManager.onMouseMove(e.detail.mouseEvent);
    }

    private onToolScroll(e: CustomEvent<GameWheelEvent>): void {
        this.state.track.toolManager.onScroll(e.detail.wheelEvent);
    }

    private onToolContextMenu(): void {
        this.state.track.toolManager.onContextMenu();
    }

    private onMouseIn(): void {
        this.state.track.mouseIn = true;
    }

    private onMouseLeave(): void {
        this.state.track.mouseIn = false;
    }
}
