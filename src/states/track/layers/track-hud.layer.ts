import { GameRenderEvent, GameUpdateEvent, Layer } from 'canvade';
import { FRAME_DURATION } from '../../../openrider/constants/game.constants';
import type { RemoteRunner } from '../../../openrider/bike/runner/remote-runner';
import { LiveEditSession } from '../../../openrider/live/live-edit-session';
import { LiveSession } from '../../../openrider/live/live-session';
import { InterfaceScale } from '../../../openrider/numeric/interface-scale';
import { Time } from '../../../openrider/numeric/time';
import { debugStats } from '../../../openrider/track/debug-stats';
import { DEBUG_PANEL_BOTTOM, debugPanelX } from '../ui/debug-panel';
import { uiMetrics } from '../ui/ui-theme';
import type { TrackViewState } from '../track-view.state';

export const LINE_HEIGHT = 15,
    /** Weight of the last frame in the smoothed frame rate. */
    FPS_SMOOTHING = 0.1;

/** Space between the side edges of the canvas and the text, clear of the toolbars, in UI pixels. */
export function hudMargin(): number {
    return uiMetrics().toolSize + 4;
}

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
            debugPanelX() - 2,
            DEBUG_PANEL_BOTTOM + 2,
            width + 4,
            LINE_HEIGHT * lines.length + 4,
        );
        ctx.fillStyle = '#000';
        lines.forEach((line, index) => {
            ctx.fillText(line, debugPanelX(), DEBUG_PANEL_BOTTOM + LINE_HEIGHT * (index + 1));
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
        ctx.fillText(Time.format(track.time * FRAME_DURATION), hudMargin(), LINE_HEIGHT);
        ctx.fillText(
            `${track.playerRunner.targetsReached.size}/${targets}`,
            hudMargin(),
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
                width - hudMargin() - ctx.measureText(text).width,
                LINE_HEIGHT * (1 + index++),
            );
        });

        this.drawLiveRiders(ctx, width, index + 1, (runner) => {
            const time = Time.format((runner.finishedAt ?? runner.time) * FRAME_DURATION);
            return runner.finishedAt === null
                ? `${time} - ${runner.targetsReached.size}/${targets}`
                : `finished in ${time}`;
        });
        this.drawLiveState(ctx, 3);
    }

    /**
     * Draws the progress of each rider of the live session at the right, in its color.
     *
     * @param line - Line of the first rider, from 1 at the top.
     * @param progress - Progress of a rider, after their name.
     */
    protected drawLiveRiders(
        ctx: CanvasRenderingContext2D,
        width: number,
        line: number,
        progress: (runner: RemoteRunner) => string,
    ): void {
        let index = line;
        this.state.track.remoteRunners.forEach((runner) => {
            const text = `${runner.label}: ${progress(runner)}`;
            ctx.fillStyle = runner.color;
            ctx.fillText(
                text,
                width - hudMargin() - ctx.measureText(text).width,
                LINE_HEIGHT * index++,
            );
        });
    }

    /**
     * Draws the state of the live session at the left, if any: the connection, then the
     * verification of the last run.
     *
     * @param line - Line of the state, from 1 at the top.
     */
    protected drawLiveState(ctx: CanvasRenderingContext2D, line: number): void {
        const editing = LiveEditSession.of(this.state.track)?.state;
        if (editing) {
            const editors = editing.editors.length;
            ctx.fillStyle = '#000';
            ctx.fillText(
                editing.state === 'open' && editing.loaded
                    ? `Live: ${editors} ${editors === 1 ? 'editor' : 'editors'}`
                    : `Live: ${editing.message}`,
                hudMargin(),
                LINE_HEIGHT * line,
            );
        }
        const live = LiveSession.of(this.state.track);
        if (live) {
            ctx.fillStyle = '#000';
            TrackHudLayer.liveLines(live).forEach((text, i) =>
                ctx.fillText(text, hudMargin(), LINE_HEIGHT * (line + i)),
            );
        }
    }

    private static liveLines(live: LiveSession): string[] {
        const { state, message, results, finish } = live.state;
        if (state !== 'open') {
            return [`Live: ${message}`];
        }
        const riding = results.filter((result) => result.riding).length;
        const lines = [`Live: ${riding} ${riding === 1 ? 'rider' : 'riders'}`];
        if (finish && 'time' in finish) {
            const time = Time.format(finish.time * FRAME_DURATION);
            const retired = finish.retired ? ' (retired)' : '';
            lines.push(
                finish.distance === undefined
                    ? `Run verified: ${time}`
                    : `Run verified: ${finish.distance} m in ${time}${retired}`,
            );
        } else if (finish) {
            lines.push(`Run refused: ${finish.reason}`);
        }
        return lines;
    }
}
