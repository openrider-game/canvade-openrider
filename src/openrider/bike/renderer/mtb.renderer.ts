import { Vector } from 'canvade';
import { MODIFIERS } from '../../item/modifiers';
import { LinePath } from '../../numeric/line-path';
import { Transform } from '../../numeric/transform';
import type { Bike } from '../bike';
import { RiderRenderer } from './rider.renderer';

/** Draws an `MTB` and its rider. */
export abstract class MTBRenderer {
    /**
     * Draws the bike at the display positions of its points, converted to canvas pixels.
     *
     * @param opacityFactor - Global opacity, lower for ghosts.
     */
    public static render(ctx: CanvasRenderingContext2D, bike: Bike, opacityFactor: number): void {
        const zoom = bike.track.zoomFactor;
        const backWheel = bike.track.toPixel(bike.backWheel.displayPos);
        const frontWheel = bike.track.toPixel(bike.frontWheel.displayPos);
        const hitbox = bike.track.toPixel(bike.hitbox.displayPos);

        const wheelsDistance = frontWheel.sub(backWheel);
        const wheelsDistance90deg = new Vector(
            (frontWheel.y - backWheel.y) * bike.direction,
            (backWheel.x - frontWheel.x) * bike.direction,
        );
        const hitBoxDistance = hitbox.sub(backWheel.add(wheelsDistance.scale(0.5)));

        const bikeTransform = new Transform(backWheel, wheelsDistance, wheelsDistance90deg);
        const hitboxTransform = new Transform(backWheel, wheelsDistance, hitBoxDistance);

        const wheelLineWidth = 3.5;
        const wheelRadius = (bike.backWheel.size - wheelLineWidth / 2) * zoom;

        const chainStay = bikeTransform.scale(0.4, 0.05);
        const seatTube = hitboxTransform.scale(0.46, 0.4);
        const topTube = hitboxTransform.scale(0.72, 0.64);

        const downTube = bikeTransform.scale(0.43, 0.05);

        const seatPostA = hitboxTransform.scale(0.45, 0.3);
        const seatPostB = hitboxTransform.scale(0.3, 0.4);

        const steer = hitboxTransform.scale(0.46, 0.4);
        const steerConnector = hitboxTransform.scale(0.28, 0.5);

        const saddle = hitboxTransform.scale(0.25, 0.6);
        const saddleA = hitboxTransform.scale(0.17, 0.6);
        const saddleB = hitboxTransform.scale(0.3, 0.6);

        const pedalRelativePos = new Vector(
            6 * zoom * Math.cos(bike.distance),
            6 * zoom * Math.sin(bike.distance),
        );
        const pedalA = chainStay.add(pedalRelativePos);
        const pedalB = chainStay.sub(pedalRelativePos);

        const frontFork = hitboxTransform.scale(0.71, 0.73);
        const headset = hitboxTransform.scale(0.73, 0.77);
        const handlebarGrips = hitboxTransform.scale(0.7, 0.8);

        ctx.save();
        ctx.strokeStyle = bike.color;
        ctx.globalAlpha = opacityFactor;
        ctx.lineWidth = wheelLineWidth * zoom;

        // Wheels
        ctx.beginPath();

        if (bike.runner.modifiersMask & MODIFIERS.SLIPPERY) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#5bf';
        }

        ctx.arc(backWheel.x, backWheel.y, wheelRadius, 0, 2 * Math.PI, true);
        ctx.moveTo(frontWheel.x + wheelRadius, frontWheel.y);
        ctx.arc(frontWheel.x, frontWheel.y, wheelRadius, 0, 2 * Math.PI, true);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.shadowColor = '#000';

        // Wheel hubs
        ctx.fillStyle = bike.color;
        ctx.globalAlpha = 0.5 * opacityFactor;
        ctx.beginPath();
        ctx.arc(backWheel.x, backWheel.y, wheelRadius * 0.5, 0, 2 * Math.PI, true);
        ctx.moveTo(frontWheel.x + wheelRadius, frontWheel.y);
        ctx.arc(frontWheel.x, frontWheel.y, wheelRadius * 0.4, 0, 2 * Math.PI, true);
        ctx.fill();
        ctx.globalAlpha = opacityFactor;

        // Frame
        ctx.lineWidth = 5 * zoom;
        LinePath.render(ctx, [
            // Main structure
            [backWheel, chainStay],
            [topTube, seatTube, chainStay],
        ]);

        ctx.lineWidth = 2 * zoom;
        LinePath.render(ctx, [
            [topTube, downTube],
            [seatPostA, seatPostB, saddle],
            [saddleA, saddleB],
            [pedalA, pedalB],
        ]);

        ctx.lineWidth = zoom;
        LinePath.render(ctx, [[steer, steerConnector]]);

        ctx.lineWidth = 3 * zoom;
        LinePath.render(ctx, [[frontWheel, frontFork, headset, handlebarGrips]]);

        if (!bike.runner.dead) {
            if (bike.runner.modifiersMask & MODIFIERS.INVINCIBILITY) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'black';
            }

            const crossFrameSaddle = hitboxTransform.scale(0.3, 0.25);
            const player = new Transform(crossFrameSaddle, wheelsDistance, hitBoxDistance);
            // Both knees are computed from the crank, not from the pedals
            const footMedian = hitboxTransform.scale(0.4, 0.05);

            RiderRenderer.render(
                ctx,
                {
                    player,
                    hip: player.scale(-0.05, 0.42),
                    body: player.scale(0.1, 0.93),
                    headCenter: player.scale(0.2, 1.09),
                    hand: hitboxTransform.scale(0.67, 0.8),
                    foot: pedalA,
                    shadowFoot: pedalB,
                    footTarget: footMedian,
                    shadowFootTarget: footMedian,
                    elbowOffset: 0.3,
                    armLength: 8,
                    forearmLength: 4,
                    hat: {
                        frontBottom: [0.37, 1.19],
                        backBottom: [0.02, 1.14],
                        front: [0.28, 1.17],
                        back: [0.09, 1.15],
                    },
                },
                bike.direction,
                zoom,
                bike.color,
                opacityFactor,
            );
        }

        ctx.restore();
    }
}
