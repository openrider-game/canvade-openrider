import { Vector } from 'canvade';

/**
 * Local coordinate system: an origin and two axes, used to place bike and rider parts.
 *
 * The axes are not normalized: they usually join two parts of the bike, so that positions can
 * be given as fractions of the bike dimensions.
 */
export class Transform {
    public constructor(
        public readonly origin: Vector,
        public readonly x: Vector,
        public readonly y: Vector,
    ) {}

    /** Converts local coordinates to a position: `origin + x * xFactor + y * yFactor`. */
    public scale(xFactor: number, yFactor: number): Vector {
        return this.origin.add(this.x.scale(xFactor)).add(this.y.scale(yFactor));
    }
}
