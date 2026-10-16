import { Vector } from 'canvade';
import { Part } from '../entity/part';
import { Wheel } from '../entity/wheel';
import { Transform } from '../numeric/transform';
import type { Track } from '../track/track';
import type { BikeRunner } from './runner/bike-runner';
import { CONTROL_NAMES, ControlName } from './runner/runner-controls';
import { Spring } from './spring';

/** Constructor of a concrete bike, also exposing its name as written in track and ghost codes. */
export interface BikeClass {
    new (track: Track, runner: BikeRunner): Bike;
    readonly bikeName: string;
}

/**
 * Track times (in physics ticks) at which each control changed state, used to generate ghosts.
 *
 * Each list is in increasing order, every time toggling the state of the control.
 */
export type KeyLog = Map<ControlName, number[]>;

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
 * Bike physics shared by every bike model: three verlet points (the hitbox carrying the rider
 * and two wheels) linked by three damped springs.
 *
 * Physics run in {@link BikeRunner.fixedUpdate} at a fixed rate of 50 ticks per second, in world
 * units. Subclasses set the sizes and spring constants, the start position and the renderer.
 */
export abstract class Bike {
    /** Name of the bike, as written in track codes and ghost strings. */
    public static readonly bikeName: string = 'Bike';

    /** Factor applied to the velocity of every point on each physics tick. */
    public friction = 0.99;
    /** Pedal crank angle in radians, increased while accelerating. */
    public distance = 0;
    /** 1 when the bike faces right, -1 when it faces left. */
    public direction = 1;
    /** Acceleration added to the velocity of every point on each physics tick, in world units. */
    public gravity = new Vector(0, 0.3);

    /** Slow motion: physics only run every other tick (see {@link Bike.slowParity}). */
    public slow = false;
    /** Alternates between 0 and 1 in slow motion, the physics run when it is 0. */
    public slowParity = 0;

    /** Engine power factor, modified by status items. */
    public engineValueScale = 1;
    /** Wheel speed factor, modified by status items. */
    public speedValueScale = 1;
    /** Steering (lean) factor, modified by status items. */
    public steerValueScale = 1;
    /** Gravity factor, modified by status items, the direction being kept by gravity items. */
    public gravityValueScale = 1;

    public color = '#000';
    /** Divisor of the rotation applied to the wheels spring when leaning. */
    public rotationFactor = 0;

    /** Point carrying the rider: touching a line with it crashes the bike. */
    public hitbox: Part;
    public backWheel: Wheel;
    public frontWheel: Wheel;

    public headToBack: Spring;
    public frontToBack: Spring;
    public headToFront: Spring;

    /** Points updated on each physics tick, in reverse order. */
    public points: Part[];
    /** Springs updated on each physics tick before the points, in reverse order. */
    public joints: Spring[];

    public keyLog: KeyLog;

    public constructor(
        public readonly track: Track,
        public readonly runner: BikeRunner,
    ) {
        this.hitbox = new Part(new Vector(), this);
        this.hitbox.drive = () => this.runner.crash();
        this.backWheel = new Wheel(new Vector(), this);
        this.frontWheel = new Wheel(new Vector(), this);

        this.headToBack = new Spring(this.hitbox, this.backWheel);
        this.frontToBack = new Spring(this.backWheel, this.frontWheel);
        this.headToFront = new Spring(this.frontWheel, this.hitbox);

        this.points = [this.hitbox, this.backWheel, this.frontWheel];
        this.joints = [this.headToBack, this.frontToBack, this.headToFront];

        this.keyLog = new Map(CONTROL_NAMES.map((name) => [name, []]));

        this.setBikeInitialState(track.origin);
    }

    public get bikeClass(): BikeClass {
        return this.constructor as BikeClass;
    }

    /**
     * Places the points of the bike at the start of a run.
     *
     * @param startPos - Start position of the track, in world units.
     */
    public abstract setBikeInitialState(startPos: Vector): void;

    /**
     * Draws the bike and its rider at their interpolated display positions.
     *
     * @param opacityFactor - Global opacity, lower for ghosts.
     */
    public abstract render(ctx: CanvasRenderingContext2D, opacityFactor: number): void;

    /**
     * Applies the runner controls to the bike (turn, engine, lean), once per physics tick before
     * the springs and points are updated.
     */
    public updatePhysics(): void {
        const controls = this.runner.controls;

        if (controls.turnPressed) {
            this.turn();
        }
        this.backWheel.speedValue +=
            (Number(controls.upPressed) * this.speedValueScale * this.engineValueScale -
                this.backWheel.speedValue) /
            10;
        const rotate =
            (Number(controls.leftPressed) - Number(controls.rightPressed)) * this.steerValueScale;
        this.headToBack.lean(rotate * 5 * this.direction, 5);
        this.headToFront.lean(-rotate * 5 * this.direction, 5);
        this.frontToBack.rotate(rotate / this.rotationFactor);
        if (!rotate && Number(controls.upPressed) * this.engineValueScale) {
            this.headToBack.lean(-7, 5);
            this.headToFront.lean(7, 5);
        }
    }

    /** Enables or disables slow motion, restarting the tick parity when needed. */
    public setSlow(slow: boolean): void {
        if ((!this.slow && slow) || !slow) {
            this.slowParity = 0;
        }
        this.slow = slow;
    }

    /** Makes the bike face the other way by swapping its wheels. */
    public turn(): void {
        this.direction = -this.direction;
        this.frontToBack.turn();
        const headToBack = this.headToBack.len;
        this.headToBack.len = this.headToFront.len;
        this.headToFront.len = headToBack;
    }

    /** Computes the rider body positions from the current physics positions, in world units. */
    public getRider(): Rider {
        const wheelsDistance = this.frontWheel.pos.sub(this.backWheel.pos);
        const wheelsToHitboxMedian = this.hitbox.pos.sub(
            this.frontWheel.pos.add(this.backWheel.pos).scale(0.5),
        );
        const wheelsDistance90deg = new Vector(
            wheelsDistance.y * this.direction,
            -wheelsDistance.x * this.direction,
        );
        const pedalPos = new Vector(6 * Math.cos(this.distance), 6 * Math.sin(this.distance));

        const armLength = 9;
        const forearmLength = 7;
        const legPartLength = 13;

        const headTransform = new Transform(
            this.backWheel.pos,
            wheelsDistance,
            wheelsToHitboxMedian,
        );
        const bodyTransform = new Transform(
            this.backWheel.pos,
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
            headToHandDistance.y * this.direction,
            -headToHandDistance.x * this.direction,
        );
        const armLengthRatio =
            (armLength ** 2 + forearmLength ** 2) / headToHandDistance90deg.lengthSquared();
        const elbow = head.add(hand).scale(0.5).add(headToHandDistance90deg.scale(armLengthRatio));

        const knee = this.getKnee(hip, foot, legPartLength);
        const shadowKnee = this.getKnee(hip, shadowFoot, legPartLength);

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

    private getKnee(hip: Vector, foot: Vector, legPartLength: number): Vector {
        const hipToFootDistance = hip.sub(foot);
        const hipToFootDistance90deg = new Vector(
            -hipToFootDistance.y * this.direction,
            hipToFootDistance.x * this.direction,
        );
        const legLengthRatio = (2 * legPartLength ** 2) / hipToFootDistance90deg.lengthSquared();

        return hip.add(foot).scale(0.5).add(hipToFootDistance90deg.scale(legLengthRatio));
    }

    public clone(): Bike {
        const clone = new this.bikeClass(this.track, this.runner);

        clone.friction = this.friction;

        clone.distance = this.distance;
        clone.direction = this.direction;
        clone.gravity = this.gravity.clone();

        clone.slow = this.slow;
        clone.slowParity = this.slowParity;

        // Status items modify these, they must survive checkpoints
        clone.engineValueScale = this.engineValueScale;
        clone.speedValueScale = this.speedValueScale;
        clone.steerValueScale = this.steerValueScale;
        clone.gravityValueScale = this.gravityValueScale;

        clone.color = this.color;
        clone.rotationFactor = this.rotationFactor;

        clone.backWheel = this.backWheel.clone();
        clone.backWheel.bike = clone;

        clone.frontWheel = this.frontWheel.clone();
        clone.frontWheel.bike = clone;

        clone.hitbox = this.hitbox.clone();
        clone.hitbox.bike = clone;
        clone.hitbox.drive = () => clone.runner.crash();

        clone.headToBack = this.headToBack.clone();
        clone.headToBack.a = clone.hitbox;
        clone.headToBack.b = clone.backWheel;

        clone.frontToBack = this.frontToBack.clone();
        clone.frontToBack.a = clone.backWheel;
        clone.frontToBack.b = clone.frontWheel;

        clone.headToFront = this.headToFront.clone();
        clone.headToFront.a = clone.frontWheel;
        clone.headToFront.b = clone.hitbox;

        clone.points = [clone.hitbox, clone.backWheel, clone.frontWheel];
        clone.joints = [clone.headToBack, clone.frontToBack, clone.headToFront];

        clone.keyLog = new Map(
            Array.from(this.keyLog, ([name, times]): [ControlName, number[]] => [name, [...times]]),
        );

        return clone;
    }

    /**
     * Places the 3 points of the bike at rest, relative to the start position.
     *
     * @param hitbox - Offset of the hitbox from the start position, in world units.
     * @param back - Offset of the back wheel.
     * @param front - Offset of the front wheel.
     */
    protected placePoints(startPos: Vector, hitbox: Vector, back: Vector, front: Vector): void {
        const place = (part: Part, offset: Vector) => {
            part.pos = startPos.add(offset);
            part.oldPos = part.pos.clone();
            part.displayPos = part.pos.clone();
        };

        place(this.hitbox, hitbox);
        place(this.backWheel, back);
        place(this.frontWheel, front);
    }
}
