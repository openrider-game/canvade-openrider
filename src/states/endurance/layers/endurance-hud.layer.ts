import { FRAME_DURATION } from '../../../openrider/constants/game.constants';
import type { EnduranceResult } from '../../../openrider/endurance/endurance-records';
import { modifierNames } from '../../../openrider/item/modifiers';
import { Time } from '../../../openrider/numeric/time';
import { HUD_MARGIN, LINE_HEIGHT, TrackHudLayer } from '../../track/layers/track-hud.layer';
import type { TrackEnduranceState } from '../track-endurance.state';

/** Size of the panel shown once a run is over, in UI pixels. */
const PANEL_WIDTH = 300,
    PANEL_HEIGHT = 96;

/**
 * Heads-up display of the endurance mode: time, distance, difficulty and status effects of the
 * run at the top left, the track and the records at the top right, and the result of the run in
 * the middle once the rider fell.
 */
export class EnduranceHudLayer extends TrackHudLayer {
    public constructor(private readonly endurance: TrackEnduranceState) {
        super(endurance);
    }

    protected override drawHud(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const run = this.endurance.run;
        if (!run) {
            return;
        }
        const course = run.course;
        const bike = course.track.playerRunner.instance;
        const difficulty = course.difficultyAt(bike?.hitbox.pos.x ?? course.track.origin.x);

        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#000';
        const left = [
            EnduranceHudLayer.time(run.time),
            `${Math.floor(run.distance)} m`,
            `Difficulty ${Math.round(difficulty * 100)}%`,
        ];
        // The status effects of the zone the bike rides through
        const effects = modifierNames(course.track.playerRunner.modifiersMask);
        if (effects.length > 0) {
            left.push(effects.join(', '));
        }
        left.forEach((text, index) => ctx.fillText(text, HUD_MARGIN, LINE_HEIGHT * (index + 1)));

        const right = [
            `Track ${course.seed}`,
            `Track best: ${EnduranceHudLayer.result(run.records.bestOn(course.seed))}`,
            `Best: ${EnduranceHudLayer.result(run.records.best)}`,
        ];
        right.forEach((text, index) =>
            ctx.fillText(
                text,
                width - HUD_MARGIN - ctx.measureText(text).width,
                LINE_HEIGHT * (index + 1),
            ),
        );

        if (run.result) {
            this.drawResult(ctx, width, height, run.result);
        }
    }

    /** Result of the run in a panel at the middle, with the keys to go on. */
    private drawResult(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        result: EnduranceResult,
    ): void {
        const beaten = this.endurance.run?.beaten;
        const title = beaten?.overall ? 'New record!' : beaten?.track ? 'Track record!' : 'Crashed';
        const x = (width - PANEL_WIDTH) / 2;
        const y = (height - PANEL_HEIGHT) / 2;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(x, y, PANEL_WIDTH, PANEL_HEIGHT);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, PANEL_WIDTH, PANEL_HEIGHT);

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
        ctx.fillText(title, width / 2, y + 30);
        ctx.font = '14px Arial, Helvetica, sans-serif';
        ctx.fillText(EnduranceHudLayer.result(result), width / 2, y + 54);
        ctx.fillStyle = '#666';
        ctx.fillText('Enter: try again    N: new track', width / 2, y + 80);
        ctx.restore();
    }

    /** A time in physics ticks, as `mm:ss.d`. */
    private static time(ticks: number): string {
        return Time.format(ticks * FRAME_DURATION);
    }

    /** A result as `123 m in 01:02.3`, or a dash without one. */
    private static result(result: EnduranceResult | null): string {
        return result
            ? `${Math.floor(result.distance)} m in ${EnduranceHudLayer.time(result.time)}`
            : '-';
    }
}
