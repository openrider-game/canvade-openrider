import { Color } from '../../numeric/color';
import type { Track } from '../../track/track';
import { Bike, BikeClass } from '../bike';
import { BikeRunner } from './bike-runner';
import { ControlName } from './runner-controls';

/**
 * Runner replaying the inputs of another rider: its controls toggle at the times of its run
 * listed in {@link ReplayRunner.keys}, and its name is shown above its bike. Ghosts replay a
 * recorded run, remote runners the run of a rider of a live session.
 *
 * Replayed runners share the track items with the player, but never mark them as reached.
 */
export abstract class ReplayRunner extends BikeRunner {
    public readonly isGhost = true;

    public color = '#000';
    /** Drawn lighter than the player. */
    public override readonly opacity = 0.6;
    /** Whether {@link ReplayRunner.color} was picked, kept for every bike of the runner. */
    private colorPicked = false;

    /**
     * @param ghostName - Name displayed above the bike.
     * @param keys - Times of the run (in physics ticks) at which each control toggles.
     * @param randomColor - Whether the runner gets a random dark color, false for a preview.
     */
    public constructor(
        track: Track,
        bikeClass: BikeClass,
        public readonly ghostName: string,
        protected keys: Map<ControlName, Set<number>>,
        private readonly randomColor = true,
    ) {
        super(track, bikeClass);
    }

    /** Name shown above the bike and in the heads-up display. */
    public get label(): string {
        return this.ghostName;
    }

    protected override assignColor(bike: Bike): void {
        if (this.randomColor && !this.colorPicked) {
            this.color = Color.generateRandomDark();
            this.colorPicked = true;
        }
        bike.color = this.color;
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

        bike.render(ctx, this.opacity);

        const bikePos = this.track.toPixel(
            bike.backWheel.displayPos
                .add(bike.frontWheel.displayPos)
                .add(bike.hitbox.displayPos)
                .recipScale(3),
        );

        ctx.save();
        const maxFontSize = 15 * this.track.pixelRatio;
        ctx.font = `bold ${Math.min(25 * this.track.zoomFactor, maxFontSize)}px monospace`;

        const label = this.label;
        const labelWidth = ctx.measureText(label).width;
        ctx.fillStyle = this.color;

        const nameX = bikePos.x - labelWidth / 2;
        const nameY = bikePos.y - bike.hitbox.size * 4 * this.track.zoomFactor;

        ctx.fillText(label, nameX, nameY);
        ctx.restore();
    }
}
