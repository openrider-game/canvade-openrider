import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';
import { LinePath } from '../numeric/line-path';
import type { Track } from '../track/track';
import { Collidable } from './collidable';
import { Entity } from './entity';
import type { Explosion } from './explosion';

// Relative distance of each of the 8 vertices of a shard to its center
const SHARD_SHAPE = [1, 0.7, 0.8, 0.9, 0.5, 1, 0.7, 1];

/** Piece of a bike that blew up on a bomb. */
export class Shard extends Entity implements Collidable {
    public readonly track: Track;

    /** Angle in radians. */
    public rotation: number;
    /** Angular speed, updated when bouncing on a line. */
    public rotationSpeed: number;
    public touch = true;
    public driving = false;

    private readonly friction = 0.05;

    public constructor(
        public bike: Bike,
        pos: Vector,
        vel: Vector,
        private readonly explosion: Explosion,
    ) {
        super(
            new Vector(
                pos.x + 5 * (Math.random() - Math.random()),
                pos.y + 5 * (Math.random() - Math.random()),
            ),
            new Vector(
                vel.x + 5 * (Math.random() - Math.random()),
                vel.y + 5 * (Math.random() - Math.random()),
            ),
        );

        this.track = explosion.track;
        // The random draws stay in this order, which sets the look of each shard
        this.size = 2 + Math.random() * 9;
        this.rotation = Math.random() * 2 * Math.PI;
        this.rotationSpeed = Math.random() - Math.random();
    }

    /** Bounces on the line: rolls along it and loses part of the velocity across it. */
    public drive(normal: Vector): void {
        this.rotationSpeed = normal.dot(this.velocity) / this.size;
        this.pos.selfAdd(normal.scale(-normal.dot(this.velocity) * this.friction));
        this.rotation += this.rotationSpeed;
        const length = normal.getLength();
        if (length > 0) {
            const perpendicular = new Vector(-normal.y / length, normal.x / length);
            this.oldPos.selfAdd(perpendicular.scale(perpendicular.dot(this.velocity) * 0.8));
        }
    }

    public override fixedUpdate(): void {
        this.velocity.selfAdd(this.explosion.gravity);
        this.velocity = this.velocity.scale(0.99);
        this.pos.selfAdd(this.velocity);
        this.driving = false;
        if (this.touch) {
            this.track.touch(this);
        }
        this.velocity = this.pos.sub(this.oldPos);
        this.oldPos.set(this.pos);
        super.fixedUpdate();
    }

    public override update(progress: number, delta: number): void {
        super.update(progress, delta);
        this.rotation += (this.rotationSpeed * delta) / 40;
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.displayPos);
        const size = this.size * this.track.zoomFactor;

        const points = SHARD_SHAPE.map((shape, i) => {
            const dist = shape * size;
            return new Vector(
                pos.x + dist * Math.cos(this.rotation + (Math.PI * i) / 4),
                pos.y + dist * Math.sin(this.rotation + (Math.PI * i) / 4),
            );
        });

        ctx.fillStyle = '#000';
        LinePath.render(ctx, [points]);
        ctx.fill();
    }
}
