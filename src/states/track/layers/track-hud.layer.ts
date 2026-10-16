import { GameRenderEvent, Layer } from 'canvade';
import { FRAME_DURATION } from '../../../openrider/constants/game.constants';
import { Time } from '../../../openrider/numeric/time';
import type { TrackViewState } from '../track-view.state';

const HUD_MARGIN = 30,
    LINE_HEIGHT = 15;

/**
 * Heads-up display of the track states: race time and reached targets of the player at the top
 * left, remaining time and reached targets of each ghost at the top right, in its color.
 */
export class TrackHudLayer extends Layer {
    public constructor(private readonly state: TrackViewState) {
        super();
    }

    public initLayer(): void {
        this.subscribe('render', this.renderHud);
    }

    private renderHud(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        const track = this.state.track;
        const targets = track.targets.size;

        ctx.save();
        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#000';
        // Track times are counted in physics ticks
        ctx.fillText(Time.format(track.time * FRAME_DURATION), HUD_MARGIN, LINE_HEIGHT);
        ctx.fillText(
            `${track.playerRunner.targetsReached.size}/${targets}`,
            HUD_MARGIN,
            2 * LINE_HEIGHT,
        );

        let index = 0;
        track.ghostRunners.forEach((runner) => {
            const ghostTime = Math.max(0, runner.finalTime - track.time);
            const remainingTimeText =
                ghostTime > 0 ? Time.format(ghostTime * FRAME_DURATION) : 'finished!';
            const reached = `${runner.targetsReached.size}/${targets}`;
            const text = `${runner.ghostName}: ${remainingTimeText} - ${reached}`;

            ctx.fillStyle = runner.color;
            ctx.fillText(
                text,
                ctx.canvas.width - HUD_MARGIN - ctx.measureText(text).width,
                LINE_HEIGHT * (1 + index++),
            );
        });
        ctx.restore();
    }
}
