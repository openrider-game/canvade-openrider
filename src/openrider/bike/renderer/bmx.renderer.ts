import { Vector } from 'canvade';
import { MODIFIERS } from '../../item/modifiers';
import { LinePath } from '../../numeric/line-path';
import { Transform } from '../../numeric/transform';
import type { Bike } from '../bike';
import { RiderRenderer } from './rider.renderer';

/** Draws a `BMX` and its rider. */
export abstract class BMXRenderer {
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

        // The x axis goes left to right, the y axis goes top to bottom.
        // Variables are named after the usual bicycle parts names.
        const wheelsDistance = frontWheel.sub(backWheel);
        const wheelsDistance90deg = new Vector(
            (frontWheel.y - backWheel.y) * bike.direction,
            (backWheel.x - frontWheel.x) * bike.direction,
        );

        const bikeTransform = new Transform(backWheel, wheelsDistance, wheelsDistance90deg);

        const wheelLineWidth = 3.5;
        const wheelRadius = (bike.backWheel.size - wheelLineWidth / 2) * zoom;

        const seatStay = bikeTransform.scale(0.3, 0.25);
        const topTube = bikeTransform.scale(0.84, 0.42);
        const steer = bikeTransform.scale(0.84, 0.37);
        const downTube = bikeTransform.scale(0.4, 0.05);

        const pedalRelativePos = new Vector(
            6 * zoom * Math.cos(bike.distance),
            6 * zoom * Math.sin(bike.distance),
        );
        const pedalA = downTube.add(pedalRelativePos);
        const pedalB = downTube.sub(pedalRelativePos);
        const saddleA = bikeTransform.scale(0.17, 0.38);
        const saddleB = bikeTransform.scale(0.3, 0.45);
        const seatTube = bikeTransform.scale(0.25, 0.4);

        const brake = bikeTransform.scale(0.97, 0);
        const frontFork = bikeTransform.scale(0.8, 0.48);
        const headset = bikeTransform.scale(0.86, 0.5);
        const handlebarStem = bikeTransform.scale(0.82, 0.65);
        const handlebarGrips = bikeTransform.scale(0.78, 0.67);

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

        // Frame
        ctx.lineWidth = 3 * zoom;
        LinePath.render(ctx, [
            // Main structure
            [backWheel, seatStay, topTube],
            [steer, downTube, backWheel],
            // Pedals
            [pedalA, pedalB],
            // Saddle
            [saddleA, saddleB],
            // Seat tube
            [downTube, seatTube],
            // Front tube and handlebar
            [frontWheel, brake, frontFork, headset, handlebarStem, handlebarGrips],
        ]);

        if (!bike.runner.dead) {
            if (bike.runner.modifiersMask & MODIFIERS.INVINCIBILITY) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#000';
            }

            const hitboxToWheelsMedianDistance = hitbox.sub(
                backWheel.add(wheelsDistance.scale(0.5)),
            );
            const player = new Transform(seatStay, wheelsDistance, hitboxToWheelsMedianDistance);

            RiderRenderer.render(
                ctx,
                {
                    player,
                    hip: player.scale(-0.1, 0.3),
                    body: player.scale(0.05, 0.9),
                    headCenter: player.scale(0.15, 1.05),
                    hand: handlebarGrips,
                    foot: pedalA,
                    shadowFoot: pedalB,
                    footTarget: pedalA,
                    shadowFootTarget: pedalB,
                    elbowOffset: 0.4,
                    armLength: 9,
                    forearmLength: 7,
                    hat: {
                        frontBottom: [0.35, 1.15],
                        backBottom: [-0.05, 1.1],
                        front: [0.25, 1.13],
                        back: [0.05, 1.11],
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
