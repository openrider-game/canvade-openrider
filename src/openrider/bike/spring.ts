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
        const distance = this.b.pos.sub(this.a.pos);
        const perpendicular = new Vector(-distance.y / this.len, distance.x / this.len);
        this.a.pos.selfAdd(perpendicular.scale(rad));
        this.b.pos.selfAdd(perpendicular.scale(-rad));
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
        return this.b.pos.sub(this.a.pos).getLength();
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
        let distance = this.b.pos.sub(this.a.pos);
        const length = distance.getLength();
        if (length < 1) {
            return;
        }
        distance = distance.scale(1 / length);
        const force = distance.scale((length - this.len) * this.springConstant);
        const normalVelocity =
            this.b.velocity.sub(this.a.velocity).dot(distance) * this.dampConstant;
        force.selfAdd(distance.scale(normalVelocity));
        this.b.velocity.selfAdd(force.scale(-1));
        this.a.velocity.selfAdd(force);
    }
}
