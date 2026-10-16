import { Vector } from 'canvade';
import { LinePath } from '../../numeric/line-path';
import { Transform } from '../../numeric/transform';

/** Hat corner, as [x, y] factors of the player transform. */
type HatCorner = [number, number];

/**
 * Rider positions computed by a bike renderer, in canvas pixels.
 *
 * The rider is drawn on top of the bike from these positions.
 */
export interface RiderPose {
    /** Transform anchored on the saddle, its y axis going towards the hitbox. */
    player: Transform;
    hip: Vector;
    /** Top of the body, where the arm starts. */
    body: Vector;
    headCenter: Vector;
    hand: Vector;
    /** Foot position, on the pedal. */
    foot: Vector;
    /** Foot of the shadow leg, drawn half transparent behind the bike. */
    shadowFoot: Vector;
    /** Point the knee is computed from, which may differ from the foot itself. */
    footTarget: Vector;
    /** Point the shadow knee is computed from. */
    shadowFootTarget: Vector;
    /** Part of the hand to body distance at which the elbow is placed. */
    elbowOffset: number;
    /** Length of the upper arm, in world units (scaled by the zoom when drawing). */
    armLength: number;
    /** Length of the forearm, in world units (scaled by the zoom when drawing). */
    forearmLength: number;
    hat: { frontBottom: HatCorner; backBottom: HatCorner; front: HatCorner; back: HatCorner };
}

/** Draws the rider shared by every bike: legs, body, head, hat and arm. */
export abstract class RiderRenderer {
    /**
     * Draws the rider of a living bike.
     *
     * @param direction - Direction of the bike, 1 or -1, used to bend the joints the right way.
     * @param zoom - Zoom factor of the track, to scale lengths from world units to canvas pixels.
     * @param color - Color of the hat.
     * @param opacityFactor - Global opacity, lower for ghosts.
     */
    public static render(
        ctx: CanvasRenderingContext2D,
        pose: RiderPose,
        direction: number,
        zoom: number,
        color: string,
        opacityFactor: number,
    ): void {
        const legPartLength = 10 * zoom;
        // Thigh and calf, so 2 parts
        const sumOfLegPartsLengthsSquared = 2 * legPartLength ** 2;

        const knee = RiderRenderer.getJoint(
            pose.hip,
            pose.footTarget,
            0.5,
            sumOfLegPartsLengthsSquared,
            direction,
        );
        const shadowKnee = RiderRenderer.getJoint(
            pose.hip,
            pose.shadowFootTarget,
            0.5,
            sumOfLegPartsLengthsSquared,
            direction,
        );

        const headRadius = 5 * zoom;

        const armLength = pose.armLength * zoom;
        const forearmLength = pose.forearmLength * zoom;
        const sumOfArmPartsLengthsSquared = armLength ** 2 + forearmLength ** 2;

        const elbow = RiderRenderer.getJoint(
            pose.hand,
            pose.body,
            pose.elbowOffset,
            sumOfArmPartsLengthsSquared,
            direction,
        );

        ctx.lineCap = 'round';
        ctx.lineWidth = 6 * zoom;
        ctx.globalAlpha = 0.5 * opacityFactor;

        // Shadow leg
        LinePath.render(ctx, [[pose.shadowFoot, shadowKnee, pose.hip]]);
        // Leg
        ctx.globalAlpha = opacityFactor;
        LinePath.render(ctx, [[pose.foot, knee, pose.hip]]);
        // Body
        ctx.lineWidth = 8 * zoom;
        LinePath.render(ctx, [[pose.hip, pose.body]]);
        // Head
        ctx.lineWidth = 2 * zoom;
        ctx.beginPath();
        ctx.moveTo(pose.headCenter.x + headRadius, pose.headCenter.y);
        ctx.arc(pose.headCenter.x, pose.headCenter.y, headRadius, 0, 2 * Math.PI, true);
        ctx.stroke();
        // Hat
        const player = pose.player;
        const hatFrontBottom = player.scale(...pose.hat.frontBottom);
        const hatBackBottom = player.scale(...pose.hat.backBottom);
        const hatFront = player.scale(...pose.hat.front);
        const hatBack = player.scale(...pose.hat.back);
        const hatFrontTop = hatFrontBottom.sub(player.x.scale(0.1)).selfAdd(player.y.scale(0.2));
        const hatBackTop = hatBackBottom.add(player.x.scale(0.02)).selfAdd(player.y.scale(0.2));

        ctx.fillStyle = color;
        LinePath.render(ctx, [
            [hatFrontBottom, hatFront, hatFrontTop, hatBackTop, hatBack, hatBackBottom],
        ]);
        ctx.fill();
        // Arm
        ctx.lineWidth = 5 * zoom;
        LinePath.render(ctx, [[pose.body, elbow, pose.hand]]);
    }

    /**
     * Places the joint between two limb parts: on the segment between both ends,
     * pushed sideways so that the limb keeps a plausible length.
     */
    private static getJoint(
        from: Vector,
        to: Vector,
        offset: number,
        sumOfPartsLengthsSquared: number,
        direction: number,
    ): Vector {
        const distance = to.sub(from);
        const distance90deg = new Vector(distance.y * direction, -distance.x * direction);
        const lengthRatio = sumOfPartsLengthsSquared / distance.lengthSquared();

        return from.add(distance.scale(offset)).add(distance90deg.scale(lengthRatio));
    }
}
