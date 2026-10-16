import { Vector } from 'canvade';

/**
 * Point mass integrated with verlet physics in {@link Entity.fixedUpdate}, and interpolated between
 * two physics ticks in {@link Entity.update} for smooth rendering.
 *
 * Every position is in world units.
 */
export class Entity {
    /** Position at the last physics tick. */
    public pos: Vector;
    /** Position at the previous physics tick, the velocity being derived from both. */
    public oldPos: Vector;
    /**
     * Position to render, interpolated between {@link Entity.pos} and the next expected
     * position.
     */
    public displayPos: Vector;
    /** Displacement per physics tick. */
    public velocity: Vector;
    /** Collision radius. */
    public size: number;

    public constructor(pos: Vector = new Vector(), vel: Vector = new Vector(), size = 10) {
        this.pos = pos.clone();
        this.oldPos = pos.clone();
        this.displayPos = pos.add(vel);
        this.velocity = vel.clone();
        this.size = size;
    }

    /** Runs one physics tick, 50 times per second. */
    public fixedUpdate(): void {
        this.displayPos = this.pos;
    }

    /**
     * Updates the display position on every frame, by extrapolating the last physics tick.
     *
     * @param progress - Elapsed part of the current physics tick, between 0 and 1.
     * @param _delta - Time elapsed since the last frame, in milliseconds.
     */
    public update(progress: number, _delta: number): void {
        this.displayPos = this.pos.add(this.velocity.scale(progress));
    }

    /** Draws the entity at its display position, converted to canvas pixels. */
    public render(_ctx: CanvasRenderingContext2D): void {}
}
