import { GameRenderEvent, Layer } from 'canvade';
import { InterfaceScale } from '../../../openrider/numeric/interface-scale';

/** Progress displayed by a {@link ProgressLayer}. */
export interface ProgressStatus {
    /** Amount of work done, in the unit of `total`. */
    progress: number;
    /** Total amount of work, 0 when unknown (the bar then stays empty). */
    total: number;
    /** Text displayed at the center of the bar. */
    text: string;
}

const BACKGROUND_COLOR = '#ccc',
    PROGRESS_BAR_COLOR = '#aaa',
    PROGRESS_TEXT_COLOR = '#000',
    BAR_MARGIN = 100,
    BAR_HEIGHT = 30;

/** Full screen progress bar, for the loading states, drawn in UI pixels. */
export abstract class ProgressLayer extends Layer {
    public initLayer(): void {
        this.subscribe('render', this.renderProgress);
    }

    /** Returns the progress to display, called on every render. */
    protected abstract getStatus(): ProgressStatus;

    private renderProgress(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        InterfaceScale.draw(ctx, (width, height) => this.drawProgress(ctx, width, height));
    }

    private drawProgress(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const status = this.getStatus();

        const barY = height / 2 - BAR_HEIGHT / 2;
        const barW = width - BAR_MARGIN * 2;
        const ratio = status.total > 0 ? Math.min(1, status.progress / status.total) : 0;

        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(BAR_MARGIN, barY, barW, BAR_HEIGHT);

        ctx.fillStyle = PROGRESS_BAR_COLOR;
        ctx.fillRect(BAR_MARGIN, barY, ratio * barW, BAR_HEIGHT);
        ctx.strokeStyle = PROGRESS_TEXT_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(BAR_MARGIN - 1, barY - 1, barW - 1, BAR_HEIGHT + 2);

        const metrics = ctx.measureText(status.text);
        const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        ctx.fillStyle = PROGRESS_TEXT_COLOR;
        ctx.fillText(status.text, (width - metrics.width) / 2, (height + textHeight) / 2);
    }
}
