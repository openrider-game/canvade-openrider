import { Display, GameRenderEvent, Layer } from 'canvade';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '../../../openrider/constants/game.constants';
import { InterfaceScale } from '../../../openrider/numeric/interface-scale';

/**
 * Size of the frame showing the thumbnail, half its size: the thumbnail is rendered at twice the
 * zoom of the view.
 */
const FRAME_WIDTH = THUMBNAIL_WIDTH / 2,
    FRAME_HEIGHT = THUMBNAIL_HEIGHT / 2,
    HELPER_TEXT = 'Use your mouse to drag & fit an interesting part of your track in the thumbnail';

/**
 * Darkens the track around the thumbnail frame, centered on the canvas, and displays the
 * framing instructions.
 *
 * The frame and the instructions keep their size on high density screens, like the track.
 */
export class TrackUploadLayer extends Layer {
    public initLayer(): void {
        this.subscribe('render', this.renderFrame);
    }

    private renderFrame(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        const { width, height } = ctx.canvas;

        // The frame keeps its size on the screen, like the track it frames
        const frameWidth = FRAME_WIDTH * Display.pixelRatio;
        const frameHeight = FRAME_HEIGHT * Display.pixelRatio;
        const x0 = (width - frameWidth) / 2;
        const x1 = x0 + frameWidth;
        const y0 = (height - frameHeight) / 2;
        const y1 = y0 + frameHeight;

        ctx.save();

        ctx.lineWidth = Display.pixelRatio;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, y0);
        ctx.fillRect(0, y1, width, y0);
        ctx.fillRect(0, y0, x0, frameHeight);
        ctx.fillRect(x1, y0, x0, frameHeight);
        ctx.strokeRect(x0, y0, frameWidth, frameHeight);

        ctx.restore();

        InterfaceScale.draw(ctx, (uiWidth) => {
            const helperTextWidth = ctx.measureText(HELPER_TEXT).width;
            ctx.fillStyle = '#fff';
            ctx.fillRect((uiWidth - helperTextWidth) / 2 - 4, 6, helperTextWidth + 8, 18);
            ctx.fillStyle = '#000';
            ctx.fillText(HELPER_TEXT, (uiWidth - helperTextWidth) / 2, 20);
        });
    }
}
