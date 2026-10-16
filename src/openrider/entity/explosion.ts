import { Vector } from 'canvade';
import type { Bike } from '../bike/bike';
import { LinePath } from '../numeric/line-path';
import type { Track } from '../track/track';
import { Entity } from './entity';
import { Shard } from './shard';

/** Blast and bike shards left when a bike blows up on a bomb. */
export class Explosion extends Entity {
    public readonly points: Shard[];
    /** Gravity of the exploded bike, applied to the shards. */
    public readonly gravity: Vector;

    /** Radius of the blast, which shrinks on every frame. */
    private speedValue = 30 + 20 * Math.random();

    /**
     * Creates the blast and the shards of the bike.
     *
     * @param bike - Clone of the exploded bike.
     * @param time - Track time of the explosion, in physics ticks.
     */
    public constructor(
        pos: Vector,
        vel: Vector,
        bike: Bike,
        public readonly time: number,
        public readonly track: Track,
    ) {
        super(pos, vel);

        this.gravity = bike.gravity.scale(bike.gravityValueScale);
        this.points = Array.from({ length: 5 }, () => new Shard(bike, pos, vel, this));
    }

    public override fixedUpdate(): void {
        for (const piece of this.points) {
            piece.fixedUpdate();
        }
    }

    public override update(progress: number, delta: number): void {
        for (const piece of this.points) {
            piece.update(progress, delta);
        }
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        // The blast shrinks a little on every frame until it disappears
        if (this.speedValue > 0) {
            this.speedValue -= 10;

            const center = this.track.toPixel(this.pos);
            const angle = Math.random() * 2 * Math.PI;

            const points = Array.from({ length: 16 }, (_, i) => {
                const dist = (this.speedValue + 30 * Math.random()) / 2;
                return new Vector(
                    center.x + dist * Math.cos(angle + (2 * Math.PI * i) / 16),
                    center.y + dist * Math.sin(angle + (2 * Math.PI * i) / 16),
                );
            });

            ctx.fillStyle = '#ff0';
            LinePath.render(ctx, [points]);
            ctx.fill();
        }

        for (const piece of this.points) {
            piece.render(ctx);
        }
    }
}
