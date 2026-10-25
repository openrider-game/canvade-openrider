import { Vector } from 'canvade';
import { Explosion } from '../../entity/explosion';
import { Ragdoll } from '../../entity/ragdoll';
import { MODIFIERS } from '../../item/modifiers';
import type { ReachableItem } from '../../item/reachable-item';
import type { Track } from '../../track/track';
import { Bike, BikeClass } from '../bike';
import { createControls, RunnerControls } from './runner-controls';

/** State of a runner saved when reaching a checkpoint. */
interface Snapshot {
    /** Track time of the checkpoint, in physics ticks. */
    time: number;
    targetsReached: Set<number>;
    reachablesReached: Set<number>;
    commandTimes: Map<number, number>;
    controls: RunnerControls;
    bike: Bike;
    modifiersMask: number;
}

/**
 * Drives a bike on a track, whether controlled by the player or replayed from a ghost.
 *
 * {@link BikeRunner.fixedUpdate} runs the physics at 50 ticks per second,
 * {@link BikeRunner.update} interpolates the display positions between two ticks on every
 * frame, and {@link BikeRunner.render} draws the result.
 */
export abstract class BikeRunner {
    /** Ghosts replay recorded inputs and never mark items as reached. */
    public abstract readonly isGhost: boolean;

    /** Set once every target has been reached. */
    public done = false;
    /** Checkpoint snapshots, the last one being the restart point. */
    public snapshots: Snapshot[] = [];
    /** Ids of the targets reached during the current run. */
    public targetsReached = new Set<number>();
    /** Ids of the other reachable items (checkpoints...) reached during the current run. */
    public reachablesReached = new Set<number>();
    /**
     * Physics tick each command block was triggered at during the current run, by block id: the
     * objects the blocks act on depend on it for this runner (see `CommandBlock.offsetFor`).
     */
    public commandTimes = new Map<number, number>();

    /** Bike currently running, `null` once it has exploded. */
    public instance: Bike | null = null;
    /** Copy of the bike at the start position, cloned when restarting without a checkpoint. */
    public initialBike: Bike | null = null;

    /** Control states applied to the bike on the current physics tick. */
    public controls = createControls();

    /**
     * Items reached during the last physics tick. They are processed on the next tick, once
     * every part of the bike has been updated, so that a checkpoint saves a consistent bike.
     */
    public actionQueue = new Map<number, ReachableItem>();
    /** Requests a checkpoint snapshot at the start of the next physics tick. */
    public mustSave = false;

    /** Set when the rider crashed or exploded, the bike then ignores the controls. */
    public dead = false;
    /** Ragdoll or explosion simulated after the death of the rider. */
    public deadObject: Ragdoll | Explosion | null = null;

    /** Active status item effects, as a combination of {@link MODIFIERS} flags. */
    public modifiersMask = 0;

    public constructor(
        public readonly track: Track,
        public bikeClass: BikeClass,
    ) {}

    /** Creates a new bike of {@link BikeRunner.bikeClass} at the start position of the track. */
    public createBike(): void {
        this.instance = new this.bikeClass(this.track, this);
        this.assignColor(this.instance);
        this.initialBike = this.instance.clone();
    }

    /** Hook called on each new bike to set its color. */
    protected assignColor(_bike: Bike): void {}

    /**
     * Starts a new run, from a checkpoint or from the start position, and sets the track time
     * accordingly.
     *
     * @param snapshot - Checkpoint to start from, the start position when omitted.
     */
    public startFrom(snapshot?: Snapshot): void {
        this.done = false;
        this.dead = false;
        this.deadObject = null;

        this.actionQueue = new Map();

        let bike = this.initialBike;
        this.targetsReached = new Set();
        this.reachablesReached = new Set();
        this.commandTimes = new Map();
        this.controls = createControls();
        this.modifiersMask = 0;

        this.track.time = 0;

        if (snapshot) {
            bike = snapshot.bike;
            this.targetsReached = new Set(snapshot.targetsReached);
            this.reachablesReached = new Set(snapshot.reachablesReached);
            this.commandTimes = new Map(snapshot.commandTimes);
            this.controls = { ...snapshot.controls };
            this.modifiersMask = snapshot.modifiersMask;

            this.track.time = snapshot.time;
        }

        this.instance = bike ? bike.clone() : null;

        this.track.toolManager.active = false;
    }

    private die(): boolean {
        if (this.modifiersMask & MODIFIERS.INVINCIBILITY || !this.instance) {
            return false;
        }

        this.dead = true;
        this.controls = createControls();

        this.instance.hitbox.touch = false;
        this.instance.hitbox.drive = () => {};
        this.instance.backWheel.speedValue = 0;

        return true;
    }

    /** Kills the rider when its hitbox touches a line, unless invincible, leaving a ragdoll. */
    public crash(): void {
        if (this.instance && this.die()) {
            const ragdoll = new Ragdoll(this.instance.getRider(), this.instance);
            ragdoll.setVelocity(
                this.instance.hitbox.velocity.clone(),
                this.instance.backWheel.velocity.clone(),
            );
            this.deadObject = ragdoll;
        }
    }

    /**
     * Kills the rider on a bomb, unless invincible: the bike is replaced by an explosion.
     *
     * @param pos - Position of the explosion, in world units.
     * @param vel - Initial velocity of the shards.
     */
    public explode(pos: Vector, vel: Vector): void {
        if (this.instance && this.die()) {
            this.deadObject = new Explosion(
                pos,
                vel,
                this.instance.clone(),
                this.track.time,
                this.track,
            );
            this.instance = null;
        }
    }

    public hitReachable(reachable: ReachableItem): void {
        this.reachablesReached.add(reachable.id);
    }

    public hitTarget(target: ReachableItem): void {
        if (!this.targetsReached.has(target.id)) {
            this.targetsReached.add(target.id);
            this.onHitTarget();
        }
    }

    public hitCheckpoint(checkpoint: ReachableItem): void {
        if (!this.reachablesReached.has(checkpoint.id)) {
            this.reachablesReached.add(checkpoint.id);
            this.onHitCheckpoint();
        }
    }

    /** Hook called when a target is reached for the first time in the run. */
    protected onHitTarget(): void {}
    /** Hook called when a checkpoint is reached for the first time in the run. */
    protected onHitCheckpoint(): void {}

    /** Drops every checkpoint, so that the next restart goes back to the start position. */
    public reset(): void {
        this.snapshots = [];
    }

    /** Starts a new run from the last checkpoint, or from the start position if there is none. */
    public restart(): void {
        this.startFrom(this.snapshots[this.snapshots.length - 1]);
    }

    private save(): void {
        const snapshot = this.snapshot();
        if (snapshot) {
            this.snapshots.push(snapshot);
        }
    }

    private snapshot(): Snapshot | null {
        if (!this.instance) {
            return null;
        }

        return {
            time: this.track.time,
            targetsReached: new Set(this.targetsReached),
            reachablesReached: new Set(this.reachablesReached),
            commandTimes: new Map(this.commandTimes),
            controls: { ...this.controls },
            bike: this.instance.clone(),
            modifiersMask: this.modifiersMask,
        };
    }

    /** Drops the last checkpoint, so that the next restart goes back to the previous one. */
    public popCheckpoint(): void {
        this.snapshots.pop();
    }

    private processActionQueue(): void {
        this.actionQueue.forEach((reachable) => reachable.reachBy(this));
    }

    /** Updates {@link controls} for the current physics tick, while the rider is alive. */
    protected abstract updateControls(bike: Bike): void;

    /** Draws the living bike, called by {@link BikeRunner.render}. */
    public abstract renderInstance(ctx: CanvasRenderingContext2D): void;

    /**
     * Runs one physics tick (50 per second): processes the items reached on the previous tick,
     * saves the pending checkpoint, then updates the controls, the springs and the points.
     *
     * The order of the steps must not change: the recorded ghosts only replay identically with
     * this exact order of computations.
     */
    public fixedUpdate(): void {
        // The objects the command blocks act on, after the objects added or removed since
        this.track.commands.refresh();

        // All the parts must run their fixedUpdate before saving, otherwise the bike clone gets
        // inconsistent values, some of them being 1 tick behind or ahead. Thus, checkpoints and
        // targets are added to the action queue instead of being processed directly.
        if (this.actionQueue.size) {
            this.processActionQueue();
            this.actionQueue = new Map();
        }

        if (this.mustSave) {
            this.mustSave = false;
            this.save();
        }

        // The instance can explode while its points are updated, keep a reference to it
        const bike = this.instance;
        if (bike) {
            if (bike.backWheel.driving && bike.frontWheel.driving && !this.dead) {
                bike.setSlow(false);
            }

            if (!this.dead) {
                this.updateControls(bike);
            }

            bike.updatePhysics();

            if (bike.slow) {
                bike.slowParity = 1 - bike.slowParity;
            }

            if (!bike.slow || bike.slowParity === 0) {
                for (let i = bike.joints.length - 1; i >= 0; i--) {
                    bike.joints[i].fixedUpdate();
                }

                for (let i = bike.points.length - 1; i >= 0; i--) {
                    bike.points[i].fixedUpdate();
                }
            }
        }

        this.deadObject?.fixedUpdate();
    }

    /**
     * Interpolates the display positions between two physics ticks and turns the pedals, on
     * every frame.
     *
     * @param progress - Elapsed part of the current physics tick, between 0 and 1.
     * @param delta - Time elapsed since the last frame, in milliseconds.
     */
    public update(progress: number, delta: number): void {
        const bike = this.instance;
        if (bike) {
            if (bike.slow) {
                // In slow motion, one physics step lasts two ticks
                progress = (progress + bike.slowParity) / 2;
            }
            bike.backWheel.update(progress, delta);
            bike.frontWheel.update(progress, delta);
            bike.hitbox.update(progress, delta);
            if (this.controls.upPressed) {
                bike.distance +=
                    ((bike.backWheel.rotationSpeed / bike.speedValueScale) * delta) / 100;
            }
        }

        this.deadObject?.update(progress, delta);
    }

    /** Draws the bike if alive, then the ragdoll or the explosion if dead. */
    public render(ctx: CanvasRenderingContext2D): void {
        if (this.instance) {
            this.renderInstance(ctx);
        }

        this.deadObject?.render(ctx);
    }
}
