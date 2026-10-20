import { Vector } from 'canvade';
import { Transform } from '../numeric/transform';
import type { Bike } from './bike';

/** Rider body positions in world units, used to build the ragdoll when crashing. */
export interface Rider {
    head: Vector;
    hand: Vector;
    shadowHand: Vector;
    hip: Vector;
    foot: Vector;
    shadowFoot: Vector;
    elbow: Vector;
    shadowElbow: Vector;
    knee: Vector;
    shadowKnee: Vector;
}

/**
 * Pose of the rider on a bike, computed from the physics positions of the bike: the order of the
 * computations follows the original game, as the ragdoll of a crash starts from this pose.
 */
export abstract class RiderPose {
    /** Computes the rider body positions from the current physics positions of a bike. */
    public static compute(bike: Bike): Rider {
        const wheelsDistance = bike.frontWheel.pos.sub(bike.backWheel.pos);
        const wheelsToHitboxMedian = bike.hitbox.pos.sub(
            bike.frontWheel.pos.add(bike.backWheel.pos).scale(0.5),
        );
        const wheelsDistance90deg = new Vector(
            wheelsDistance.y * bike.direction,
            -wheelsDistance.x * bike.direction,
        );
        const pedalPos = new Vector(6 * Math.cos(bike.distance), 6 * Math.sin(bike.distance));

        const armLength = 9;
        const forearmLength = 7;
        const legPartLength = 13;

        const headTransform = new Transform(
            bike.backWheel.pos,
            wheelsDistance,
            wheelsToHitboxMedian,
        );
        const bodyTransform = new Transform(
            bike.backWheel.pos,
            wheelsDistance,
            wheelsDistance90deg,
        );

        const head = headTransform.scale(0.35, 1.2);
        const hand = bodyTransform.scale(0.8, 0.68);
        const hip = bodyTransform.scale(0.2, 0.5);
        const foot = bodyTransform.scale(0.4, 0.05).add(pedalPos);
        const shadowFoot = bodyTransform.scale(0.4, 0.05).sub(pedalPos);

        const headToHandDistance = head.sub(hand);
        const headToHandDistance90deg = new Vector(
            headToHandDistance.y * bike.direction,
            -headToHandDistance.x * bike.direction,
        );
        const armLengthRatio =
            (armLength ** 2 + forearmLength ** 2) / headToHandDistance90deg.lengthSquared();
        const elbow = head.add(hand).scale(0.5).add(headToHandDistance90deg.scale(armLengthRatio));

        const knee = RiderPose.knee(bike, hip, foot, legPartLength);
        const shadowKnee = RiderPose.knee(bike, hip, shadowFoot, legPartLength);

        return {
            head,
            hand,
            shadowHand: hand.clone(),
            hip,
            foot,
            shadowFoot,
            elbow,
            shadowElbow: elbow.clone(),
            knee,
            shadowKnee,
        };
    }

    /** Knee between a hip and a foot, bent towards the front of the bike. */
    private static knee(bike: Bike, hip: Vector, foot: Vector, legPartLength: number): Vector {
        const hipToFootDistance = hip.sub(foot);
        const hipToFootDistance90deg = new Vector(
            -hipToFootDistance.y * bike.direction,
            hipToFootDistance.x * bike.direction,
        );
        const legLengthRatio = (2 * legPartLength ** 2) / hipToFootDistance90deg.lengthSquared();

        return hip.add(foot).scale(0.5).add(hipToFootDistance90deg.scale(legLengthRatio));
    }
}
