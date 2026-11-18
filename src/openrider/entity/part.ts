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
        // As `pos.selfAdd(normal.scale(-normal.dot(velocity) * motor))`, without allocating
        const factor = -(normal.x * this.velocity.x + normal.y * this.velocity.y) * this.motor;
        this.pos.x += normal.x * factor;
        this.pos.y += normal.y * factor;
    }

    /**
     * Applies gravity and friction, moves the part, resolves the collisions with the track, then
     * derives the new velocity from the actual displacement (verlet integration).
     */
    public override fixedUpdate(): void {
        // Scaling by 1 is exact, so the physics of the tracks without zero gravity are unchanged.
        // In plain numbers, as `velocity.selfAdd(gravity.scale(scale)).selfScale(friction)`
        // computes them, allocating nothing on every tick
        const { gravity, gravityValueScale, friction } = this.bike;
        const { pos, velocity } = this;
        velocity.x = (velocity.x + gravity.x * gravityValueScale) * friction;
        velocity.y = (velocity.y + gravity.y * gravityValueScale) * friction;
        pos.x += velocity.x;
        pos.y += velocity.y;
        this.driving = false;
        if (this.touch) {
            this.bike.track.touch(this);
        }
        // Kept by no one else: updated in place
        velocity.x = pos.x - this.oldPos.x;
        velocity.y = pos.y - this.oldPos.y;
        this.oldPos.set(pos);
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
