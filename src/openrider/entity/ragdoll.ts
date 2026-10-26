import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';
import type { Rider } from '../bike/rider-pose';
import { Spring } from '../bike/spring';
import { LinePath } from '../numeric/line-path';
import type { Track } from '../track/track';
import { Entity } from './entity';
import { Part } from './part';

/** Rider detached from its bike after a crash, in the color of the bike. */
export class Ragdoll extends Entity {
    public readonly track: Track;
    private readonly color: string;
    public readonly points: Part[];

    private readonly head: Part;
    private readonly hip: Part;
    private readonly elbow: Part;
    private readonly shadowElbow: Part;
    private readonly hand: Part;
    private readonly shadowHand: Part;
    private readonly knee: Part;
    private readonly shadowKnee: Part;
    private readonly foot: Part;
    private readonly shadowFoot: Part;

    /** Joints of the upper body, which keep a fixed length. */
    private readonly inflexibleJoints: Spring[];
    private readonly joints: Spring[];

    public constructor(rider: Rider, bike: Bike) {
        super(new Vector(), new Vector(), 0);

        this.track = bike.track;
        this.color = bike.color;

        this.head = new Part(rider.head, bike);
        this.hip = new Part(rider.hip, bike);
        this.elbow = new Part(rider.elbow, bike);
        this.shadowElbow = new Part(rider.shadowElbow, bike);
        this.hand = new Part(rider.hand, bike);
        this.shadowHand = new Part(rider.shadowHand, bike);
        this.knee = new Part(rider.knee, bike);
        this.shadowKnee = new Part(rider.shadowKnee, bike);
        this.foot = new Part(rider.foot, bike);
        this.shadowFoot = new Part(rider.shadowFoot, bike);

        this.points = [
            this.head,
            this.hip,
            this.elbow,
            this.shadowElbow,
            this.hand,
            this.shadowHand,
            this.knee,
            this.shadowKnee,
            this.foot,
            this.shadowFoot,
        ];

        this.inflexibleJoints = [
            new Spring(this.head, this.hip),
            new Spring(this.head, this.elbow),
            new Spring(this.elbow, this.hand),
            new Spring(this.head, this.shadowElbow),
            new Spring(this.shadowElbow, this.shadowHand),
        ];

        this.joints = this.inflexibleJoints.concat([
            new Spring(this.hip, this.knee),
            new Spring(this.knee, this.foot),
            new Spring(this.hip, this.shadowKnee),
            new Spring(this.shadowKnee, this.shadowFoot),
        ]);

        for (const point of this.points) {
            point.size = 3;
        }

        this.head.size = this.hip.size = 8;

        for (const joint of this.joints) {
            joint.springConstant = 0.4;
            joint.dampConstant = 0.7;
        }
    }

    /**
     * Sets the joint lengths and launches the body, with a small random velocity on each point.
     *
     * @param upperVel - Velocity of the bike hitbox, halved and applied to the upper body.
     * @param lowerVel - Velocity of the back wheel, halved and applied to the lower body.
     */
    public setVelocity(upperVel: Vector, lowerVel: Vector): void {
        upperVel.selfScale(0.5);
        lowerVel.selfScale(0.5);

        for (const joint of this.joints) {
            const len = Math.min(joint.getLength(), 20);

            joint.len = len;
            joint.lengthTowards = len;
        }

        for (const inflexibleJoint of this.inflexibleJoints) {
            inflexibleJoint.lengthTowards = 13;
            inflexibleJoint.len = 13;
        }

        const upper = [this.head, this.elbow, this.shadowElbow, this.hand, this.shadowHand];
        const lower = [this.hip, this.knee, this.shadowKnee, this.foot, this.shadowFoot];

        for (const point of upper) {
            point.oldPos = point.pos.sub(upperVel);
        }

        for (const point of lower) {
            point.oldPos = point.pos.sub(lowerVel);
        }

        for (const point of this.points) {
            point.velocity.set(point.pos.sub(point.oldPos));
            point.velocity.x += Math.random() - Math.random();
            point.velocity.y += Math.random() - Math.random();
        }
    }

    public override fixedUpdate(): void {
        for (const joint of this.joints) {
            joint.fixedUpdate();
        }

        for (const point of this.points) {
            point.fixedUpdate();
        }
    }

    public override update(progress: number, delta: number): void {
        for (const point of this.points) {
            point.update(progress, delta);
        }
    }

    /** @param opacity - Opacity of the rider, as their bike was drawn. */
    public override render(ctx: CanvasRenderingContext2D, opacity = 1): void {
        const zoom = this.track.zoomFactor;
        const head = this.track.toPixel(this.head.displayPos);
        const elbow = this.track.toPixel(this.elbow.displayPos);
        const hand = this.track.toPixel(this.hand.displayPos);
        const shadowElbow = this.track.toPixel(this.shadowElbow.displayPos);
        const shadowHand = this.track.toPixel(this.shadowHand.displayPos);
        const knee = this.track.toPixel(this.knee.displayPos);
        const foot = this.track.toPixel(this.foot.displayPos);
        const shadowKnee = this.track.toPixel(this.shadowKnee.displayPos);
        const shadowFoot = this.track.toPixel(this.shadowFoot.displayPos);
        const hip = this.track.toPixel(this.hip.displayPos);

        ctx.save();
        ctx.lineWidth = 5 * zoom;
        ctx.strokeStyle = this.color;
        // The limbs on the other side, in its shadow
        ctx.globalAlpha = 0.5 * opacity;

        LinePath.render(ctx, [
            [head, shadowElbow, shadowHand],
            [hip, shadowKnee, shadowFoot],
        ]);

        ctx.globalAlpha = opacity;

        LinePath.render(ctx, [
            [head, elbow, hand],
            [hip, knee, foot],
        ]);

        ctx.lineWidth = 8 * zoom;

        LinePath.render(ctx, [[hip, head]]);

        head.selfAdd(head.sub(hip).scale(0.25));

        ctx.lineWidth = 2 * zoom;

        ctx.beginPath();
        ctx.moveTo(head.x + 5 * zoom, head.y);
        ctx.arc(head.x, head.y, 5 * zoom, 0, 2 * Math.PI, true);
        ctx.stroke();
        ctx.restore();
    }
}
