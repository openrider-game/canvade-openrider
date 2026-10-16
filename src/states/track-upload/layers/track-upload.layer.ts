import { GameRenderEvent, Layer } from 'canvade';

/**
 * Size of the uploaded thumbnail in pixels. The frame displays it at half its size, so the
 * thumbnail is rendered at twice the zoom of the view.
 */
export const THUMBNAIL_WIDTH = 500,
    THUMBNAIL_HEIGHT = 300;

const FRAME_WIDTH = THUMBNAIL_WIDTH / 2,
    FRAME_HEIGHT = THUMBNAIL_HEIGHT / 2,
    HELPER_TEXT = 'Use your mouse to drag & fit an interesting part of your track in the thumbnail';

/**
 * Darkens the track around the thumbnail frame, centered on the canvas, and displays the
 * framing instructions.
 */
export class TrackUploadLayer extends Layer {
    public initLayer(): void {
        this.subscribe('render', this.renderFrame);
    }

    private renderFrame(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        const { width, height } = ctx.canvas;

        const x0 = (width - FRAME_WIDTH) / 2;
        const x1 = x0 + FRAME_WIDTH;
        const y0 = (height - FRAME_HEIGHT) / 2;
        const y1 = y0 + FRAME_HEIGHT;

        ctx.save();

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, y0);
        ctx.fillRect(0, y1, width, y0);
        ctx.fillRect(0, y0, x0, FRAME_HEIGHT);
        ctx.fillRect(x1, y0, x0, FRAME_HEIGHT);
        ctx.strokeRect(x0, y0, FRAME_WIDTH, FRAME_HEIGHT);

        const helperTextWidth = ctx.measureText(HELPER_TEXT).width;
        ctx.fillStyle = '#fff';
        ctx.fillRect((width - helperTextWidth) / 2 - 4, 6, helperTextWidth + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(HELPER_TEXT, (width - helperTextWidth) / 2, 20);

        ctx.restore();
    }
}
