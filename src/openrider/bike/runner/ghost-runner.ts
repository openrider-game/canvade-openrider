import { Color } from '../../numeric/color';
import { GhostParser } from '../../parser/ghost-parser';
import type { Track } from '../../track/track';
import { Bike } from '../bike';
import { BikeRunner } from './bike-runner';
import { ControlName } from './runner-controls';

/**
 * Replays a recorded run: the controls toggle at the track times stored in the ghost string.
 *
 * Ghosts share the track items with the player, but never mark them as reached.
 */
export class GhostRunner extends BikeRunner {
    public readonly isGhost = true;

    /** Time of the recorded run, in physics ticks. */
    public readonly finalTime: number;
    /** Name displayed above the ghost. */
    public readonly ghostName: string;
    public color = '#000';

    /** Track times (in physics ticks) at which each control toggles. */
    private readonly keys: Map<ControlName, Set<number>>;

    /**
     * Parses the ghost string. The bike is only created by {@link BikeRunner.createBike}.
     *
     * @param ghostString - Recorded run, in the format read by {@link GhostParser}.
     * @param randomColor - Whether the ghost gets a random dark color, false for a preview.
     */
    public constructor(
        track: Track,
        ghostString: string,
        private readonly randomColor = true,
    ) {
        const ghost = GhostParser.parse(ghostString);

        super(track, ghost.bike);

        this.keys = ghost.keys;
        this.finalTime = ghost.time;
        this.ghostName = ghost.name;
    }

    protected override assignColor(bike: Bike): void {
        if (this.randomColor) {
            this.color = Color.generateRandomDark();
        }
        bike.color = this.color;
    }

    protected override onHitTarget(): void {
        if (this.targetsReached.size >= this.track.targets.size) {
            this.done = true;
        }
    }

    protected updateControls(): void {
        this.keys.forEach((times, name) => {
            if (times.has(this.time)) {
                this.controls[name] = !this.controls[name];
            }
        });
    }

    public renderInstance(ctx: CanvasRenderingContext2D): void {
        const bike = this.instance;
        if (!bike) {
            return;
        }

        bike.render(ctx, 0.6);

        const bikePos = this.track.toPixel(
            bike.backWheel.displayPos
                .add(bike.frontWheel.displayPos)
                .add(bike.hitbox.displayPos)
                .recipScale(3),
        );

        ctx.save();
        const maxFontSize = 15 * this.track.pixelRatio;
        ctx.font = `bold ${Math.min(25 * this.track.zoomFactor, maxFontSize)}px monospace`;

        const ghostNameWidth = ctx.measureText(this.ghostName).width;
        ctx.fillStyle = this.color;

        const nameX = bikePos.x - ghostNameWidth / 2;
        const nameY = bikePos.y - bike.hitbox.size * 4 * this.track.zoomFactor;

        ctx.fillText(this.ghostName, nameX, nameY);
        ctx.restore();
    }
}
