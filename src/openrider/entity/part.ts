import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';
import { Collidable } from './collidable';
import { Entity } from './entity';

/** Point of a bike or a ragdoll, colliding with the track lines. */
export class Part extends Entity implements Collidable {
    /** Friction factor against the lines. */
    public motor = 0;
    /** Whether the part collides with the track, disabled for the hitbox of a dead rider. */
    public touch = true;
    /** Whether the part touched a line during the last physics tick. */
    public driving = false;

    public constructor(
        pos: Vector,
        public bike: Bike,
    ) {
        super(pos);
    }

    public drive(normal: Vector): void {
        this.addFriction(normal);
        this.driving = true;
    }

    /** Slows the part down along the line it touches, according to {@link Part.motor}. */
    public addFriction(normal: Vector): void {
        this.pos.selfAdd(normal.scale(-normal.dot(this.velocity) * this.motor));
    }

    /**
     * Applies gravity and friction, moves the part, resolves the collisions with the track, then
     * derives the new velocity from the actual displacement (verlet integration).
     */
    public override fixedUpdate(): void {
        this.velocity.selfAdd(this.bike.gravity).selfScale(this.bike.friction);
        this.pos.selfAdd(this.velocity);
        this.driving = false;
        if (this.touch) {
            this.bike.track.touch(this);
        }
        this.velocity = this.pos.sub(this.oldPos);
        this.oldPos.set(this.pos);
        super.fixedUpdate();
    }

    public clone(): this {
        const PartClass = this.constructor as new (pos: Vector, bike: Bike) => this;
        const clone = new PartClass(this.pos, this.bike);
        clone.oldPos = this.oldPos.clone();
        clone.velocity = this.velocity.clone();
        clone.size = this.size;
        clone.motor = this.motor;
        clone.driving = this.driving;
        return clone;
    }
}
