import { Vector } from 'canvade';
import type { Track } from '../track/track';
import { Bike } from './bike';
import { BMXRenderer } from './renderer/bmx.renderer';
import type { BikeRunner } from './runner/bike-runner';

/** Light bike with small wheels and stiff springs, the default bike. */
export class BMX extends Bike {
    public static override readonly bikeName: string = 'BMX';

    public constructor(track: Track, runner: BikeRunner) {
        super(track, runner);

        this.hitbox.size = 14;
        this.backWheel.size = 11.7;
        this.frontWheel.size = 11.7;

        this.headToBack.len = 45;
        this.headToBack.lengthTowards = 45;
        this.headToBack.springConstant = 0.35;
        this.headToBack.dampConstant = 0.3;

        this.frontToBack.len = 42;
        this.frontToBack.lengthTowards = 42;
        this.frontToBack.springConstant = 0.35;
        this.frontToBack.dampConstant = 0.3;

        this.headToFront.len = 45;
        this.headToFront.lengthTowards = 45;
        this.headToFront.springConstant = 0.35;
        this.headToFront.dampConstant = 0.3;

        this.rotationFactor = 6;
    }

    public setBikeInitialState(startPos: Vector): void {
        this.placePoints(startPos, new Vector(0, -1), new Vector(-21, 38), new Vector(21, 38));
    }

    public render(ctx: CanvasRenderingContext2D, opacityFactor: number): void {
        BMXRenderer.render(ctx, this, opacityFactor);
    }
}
