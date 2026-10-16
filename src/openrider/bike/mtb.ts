import { Vector } from 'canvade';
import type { Track } from '../track/track';
import { Bike } from './bike';
import { MTBRenderer } from './renderer/mtb.renderer';
import type { BikeRunner } from './runner/bike-runner';

/** Mountain bike with bigger wheels and softer springs than the `BMX`. */
export class MTB extends Bike {
    public static override readonly bikeName: string = 'MTB';

    public constructor(track: Track, runner: BikeRunner) {
        super(track, runner);

        this.hitbox.size = 14;
        this.backWheel.size = 14;
        this.frontWheel.size = 14;

        this.headToBack.len = 47;
        this.headToBack.lengthTowards = 47;
        this.headToBack.springConstant = 0.2;
        this.headToBack.dampConstant = 0.3;

        this.frontToBack.len = 45;
        this.frontToBack.lengthTowards = 45;
        this.frontToBack.springConstant = 0.2;
        this.frontToBack.dampConstant = 0.3;

        this.headToFront.len = 45;
        this.headToFront.lengthTowards = 45;
        this.headToFront.springConstant = 0.2;
        this.headToFront.dampConstant = 0.3;

        this.rotationFactor = 8;
    }

    public setBikeInitialState(startPos: Vector): void {
        this.placePoints(startPos, new Vector(2, -3), new Vector(-23, 35), new Vector(23, 35));
    }

    public render(ctx: CanvasRenderingContext2D, opacityFactor: number): void {
        MTBRenderer.render(ctx, this, opacityFactor);
    }
}
