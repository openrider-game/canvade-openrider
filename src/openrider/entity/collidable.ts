import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';

/** Anything that can collide with the track: bike parts, ragdoll parts and explosion shards. */
export interface Collidable {
    /** Position in world units, pushed out of the lines by the collision. */
    pos: Vector;
    velocity: Vector;
    /** Collision radius, in world units. */
    size: number;
    /** Bike the collidable comes from, used to apply item effects to its runner. */
    bike: Bike;
    /**
     * Called when colliding with a line, after the collidable has been pushed out of it.
     *
     * @param normal - Unit vector along the collided line.
     */
    drive(normal: Vector): void;
}
