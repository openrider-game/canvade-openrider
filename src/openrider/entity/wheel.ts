import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';
import { Part } from './part';

/** Bike wheel, pushed along the lines it touches by the engine. */
export class Wheel extends Part {
    /** Angular speed measured on the last collision, used to turn the pedals. */
    public rotationSpeed = 0;
    /** Engine speed, applied along the line the wheel touches. */
    public speedValue = 0;

    public constructor(center: Vector, bike: Bike) {
        super(center, bike);

        this.motor = 0.3;
    }

    /** Moves the wheel along the line according to the engine, and brakes when down is pressed. */
    public override drive(normal: Vector): void {
        this.pos.selfAdd(normal.scale(this.speedValue * this.bike.direction));
        if (this.bike.runner.controls.downPressed) {
            this.addFriction(normal);
        }
        this.rotationSpeed = normal.dot(this.velocity) / this.size;
        this.driving = true;
    }

    public override clone(): this {
        const clone = super.clone();
        clone.speedValue = this.speedValue;
        return clone;
    }
}
