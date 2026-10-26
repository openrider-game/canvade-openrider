import { GameRenderEvent, GameUpdateEvent, Layer } from 'canvade';
import { FRAME_DURATION } from '../../../openrider/constants/game.constants';
import { LiveSession } from '../../../openrider/live/live-session';
import { InterfaceScale } from '../../../openrider/numeric/interface-scale';
import { Time } from '../../../openrider/numeric/time';
import { debugStats } from '../../../openrider/track/debug-stats';
import { DEBUG_PANEL_BOTTOM, DEBUG_PANEL_X } from '../ui/debug-panel';
import type { TrackViewState } from '../track-view.state';

export const HUD_MARGIN = 30,
    LINE_HEIGHT = 15,
    /** Weight of the last frame in the smoothed frame rate. */
    FPS_SMOOTHING = 0.1;

/**
 * Heads-up display of the track states: race time and reached targets of the player at the top
 * left, remaining time and reached targets of each ghost at the top right, in its color, then the
 * time and the reached targets of each rider of the live session, whose state shows under the
 * targets of the player.
 *
 * While the debug mode shows its stats, they are drawn under the debug panel.
 *
 * Drawn in UI pixels, like the toolbars.
 */
export class TrackHudLayer extends Layer {
    public constructor(private readonly state: TrackViewState) {
        super();
    }

    /** Frame rate, smoothed over the last frames. */
    private fps = 0;

    public initLayer(): void {
        this.subscribe('render', this.renderHud);
        this.subscribe('update', this.measureFrameRate);
    }

    private measureFrameRate(e: CustomEvent<GameUpdateEvent>): void {
        const delta = e.detail.delta;
        if (delta > 0) {
            const fps = 1000 / delta;
            this.fps = this.fps ? this.fps + (fps - this.fps) * FPS_SMOOTHING : fps;
        }
    }

    private renderHud(e: CustomEvent<GameRenderEvent>): void {
        const ctx = e.detail.ctx;
        InterfaceScale.draw(ctx, (width, height) => {
            this.drawHud(ctx, width, height);
            this.drawStats(ctx);
        });
    }

    private drawStats(ctx: CanvasRenderingContext2D): void {
        const track = this.state.track;
        if (!this.state.allowsDebug() || !track.debug || !track.debugOptions.stats) {
            return;
        }

        const lines = debugStats(track, this.fps);
        const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
        // Readable over the track and the debug overlays
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(
            DEBUG_PANEL_X - 2,
            DEBUG_PANEL_BOTTOM + 2,
            width + 4,
            LINE_HEIGHT * lines.length + 4,
        );
        ctx.fillStyle = '#000';
        lines.forEach((line, index) => {
            ctx.fillText(line, DEBUG_PANEL_X, DEBUG_PANEL_BOTTOM + LINE_HEIGHT * (index + 1));
        });
    }

    /**
     * Draws the race time and the targets of the player and the ghosts.
     *
     * @param width - Width of the canvas, in UI pixels.
     * @param _height - Height of the canvas, in UI pixels.
     */
    protected drawHud(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
        const track = this.state.track;
        const targets = track.targets.size;

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
            const ghostTime = Math.max(0, runner.finalTime - runner.time);
            const remainingTimeText =
                ghostTime > 0 ? Time.format(ghostTime * FRAME_DURATION) : 'finished!';
            const reached = `${runner.targetsReached.size}/${targets}`;
            const text = `${runner.ghostName}: ${remainingTimeText} - ${reached}`;

            ctx.fillStyle = runner.color;
            ctx.fillText(
                text,
                width - HUD_MARGIN - ctx.measureText(text).width,
                LINE_HEIGHT * (1 + index++),
            );
        });

        track.remoteRunners.forEach((runner) => {
            const time = Time.format((runner.finishedAt ?? runner.time) * FRAME_DURATION);
            const progress =
                runner.finishedAt === null
                    ? `${time} - ${runner.targetsReached.size}/${targets}`
                    : `finished in ${time}`;
            const text = `${runner.label}: ${progress}`;

            ctx.fillStyle = runner.color;
            ctx.fillText(
                text,
                width - HUD_MARGIN - ctx.measureText(text).width,
                LINE_HEIGHT * (1 + index++),
            );
        });

        const live = LiveSession.of(track);
        if (live) {
            ctx.fillStyle = '#000';
            TrackHudLayer.liveLines(live).forEach((line, i) =>
                ctx.fillText(line, HUD_MARGIN, LINE_HEIGHT * (3 + i)),
            );
        }
    }

    /** State of the live session: the connection, then the verification of the last run. */
    private static liveLines(live: LiveSession): string[] {
        const { state, message, results, finish } = live.state;
        if (state !== 'open') {
            return [`Live: ${message}`];
        }
        const riding = results.filter((result) => result.riding).length;
        const lines = [`Live: ${riding} ${riding === 1 ? 'rider' : 'riders'}`];
        if (finish && 'time' in finish) {
            lines.push(`Run verified: ${Time.format(finish.time * FRAME_DURATION)}`);
        } else if (finish) {
            lines.push(`Run refused: ${finish.reason}`);
        }
        return lines;
    }
}
