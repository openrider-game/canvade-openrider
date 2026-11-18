import { Vector } from 'canvade';
import { Part } from '../entity/part';

/** Damped spring linking two parts of a bike or a ragdoll, in world units. */
export class Spring {
    /** Rest length that {@link Spring.lean} brings {@link Spring.len} back to. */
    public lengthTowards = 40;
    /** Current rest length of the spring. */
    public len = 40;
    public dampConstant = 0.5;
    public springConstant = 0.7;

    public constructor(
        public a: Part,
        public b: Part,
    ) {}

    /**
     * Moves the rest length towards {@link Spring.lengthTowards} minus `rotation`.
     *
     * @param rotation - Length offset, positive to shorten the spring.
     * @param factor - Divisor of the step: the higher, the slower the spring adapts.
     */
    public lean(rotation: number, factor: number): void {
        this.len += (this.lengthTowards - rotation - this.len) / factor;
    }

    /** Rotates the spring by moving both ends perpendicularly to it, in opposite directions. */
    public rotate(rad: number): void {
        // In plain numbers, with the operations of the vectors, allocating nothing on every tick
        const perpendicularX = -(this.b.pos.y - this.a.pos.y) / this.len;
        const perpendicularY = (this.b.pos.x - this.a.pos.x) / this.len;
        this.a.pos.x += perpendicularX * rad;
        this.a.pos.y += perpendicularY * rad;
        this.b.pos.x += perpendicularX * -rad;
        this.b.pos.y += perpendicularY * -rad;
    }

    /** Swaps the positions and velocities of both ends, to make a bike face the other way. */
    public turn(): void {
        const tmp = new Vector();

        tmp.set(this.a.pos);
        this.a.pos.set(this.b.pos);
        this.b.pos.set(tmp);

        tmp.set(this.a.oldPos);
        this.a.oldPos.set(this.b.oldPos);
        this.b.oldPos.set(tmp);

        tmp.set(this.a.velocity);
        this.a.velocity.set(this.b.velocity);
        this.b.velocity.set(tmp);
    }

    public getLength(): number {
        const x = this.b.pos.x - this.a.pos.x;
        const y = this.b.pos.y - this.a.pos.y;
        return Math.sqrt(x * x + y * y);
    }

    public clone(): Spring {
        const clone = new Spring(this.a, this.b);
        clone.lengthTowards = this.lengthTowards;
        clone.len = this.len;
        clone.dampConstant = this.dampConstant;
        clone.springConstant = this.springConstant;
        return clone;
    }

    /**
     * Applies the spring and damping forces to the velocities of both ends, once per physics tick
     * before the parts are moved.
     */
    public fixedUpdate(): void {
        // In plain numbers, with the operations of the vectors in their order, allocating nothing
        // on every tick: the recorded ghosts depend on every bit of the results
        const { a, b } = this;
        let distanceX = b.pos.x - a.pos.x;
        let distanceY = b.pos.y - a.pos.y;
        const length = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
        if (length < 1) {
            return;
        }
        const inverse = 1 / length;
        distanceX *= inverse;
        distanceY *= inverse;
        const stretch = (length - this.len) * this.springConstant;
        let forceX = distanceX * stretch;
        let forceY = distanceY * stretch;
        const normalVelocity =
            ((b.velocity.x - a.velocity.x) * distanceX +
                (b.velocity.y - a.velocity.y) * distanceY) *
            this.dampConstant;
        forceX += distanceX * normalVelocity;
        forceY += distanceY * normalVelocity;
        b.velocity.x += forceX * -1;
        b.velocity.y += forceY * -1;
        a.velocity.x += forceX;
        a.velocity.y += forceY;
    }
}
