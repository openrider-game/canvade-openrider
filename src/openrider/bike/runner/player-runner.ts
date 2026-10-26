import { ARROWDOWN, ARROWLEFT, ARROWRIGHT, ARROWUP, Control, Keyboard, KEYZ, NONE } from 'canvade';
import { ControlBindings } from '../../controls/control-bindings';
import type { Track } from '../../track/track';
import { Bike, BikeClass } from '../bike';
import { BikeRunner } from './bike-runner';
import { ControlName } from './runner-controls';

/**
 * Names of the player controls in `Keyboard`, held down by their keys, or by the buttons of the
 * touch screens (see `TouchControls`).
 */
export const PLAYER_CONTROL_NAMES = {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    turn: 'Z',
} as const;

/**
 * Player controls: the runner control, the keyboard control name, the label shown in the controls
 * panel and the default key of each one.
 */
export const PLAYER_CONTROLS: Array<{
    runnerControl: ControlName;
    name: string;
    label: string;
    key: Control;
}> = [
    {
        runnerControl: 'upPressed',
        name: PLAYER_CONTROL_NAMES.up,
        label: 'Accelerate',
        key: new Control(ARROWUP),
    },
    {
        runnerControl: 'downPressed',
        name: PLAYER_CONTROL_NAMES.down,
        label: 'Brake',
        key: new Control(ARROWDOWN),
    },
    {
        runnerControl: 'leftPressed',
        name: PLAYER_CONTROL_NAMES.left,
        label: 'Lean back',
        key: new Control(ARROWLEFT),
    },
    {
        runnerControl: 'rightPressed',
        name: PLAYER_CONTROL_NAMES.right,
        label: 'Lean forward',
        key: new Control(ARROWRIGHT),
    },
    {
        runnerControl: 'turnPressed',
        name: PLAYER_CONTROL_NAMES.turn,
        label: 'Turn around',
        key: new Control(KEYZ, NONE, true),
    },
];

/** Start of an attempt of the player, see {@link RunListener.started}. */
export interface AttemptStart {
    /** Time the previous attempt ended at, in physics ticks. */
    endedAt: number;
    /** Time the attempt starts at: the one of its checkpoint, or 0 from the start. */
    time: number;
    /** Checkpoints kept, the attempt starting from the last one. */
    checkpoints: number;
    /** Name of the bike. */
    bike: string;
}

/** Follows the run of the player, e.g. to send it to the other riders of a live session. */
export interface RunListener {
    /** A control toggled, on the tick being run. */
    toggled(time: number, control: ControlName): void;
    /** A new attempt started, from the start of the track or from a checkpoint. */
    started(start: AttemptStart): void;
}

/**
 * Runner driven by the keyboard. Every control change is recorded in the bike key log, with
 * the time of the run in physics ticks, to generate the ghost of the run. Its time is the one of
 * the track (`Track.time`).
 */
export class PlayerRunner extends BikeRunner {
    public readonly isGhost = false;
    /** Listener of the run, if any. */
    public runListener: RunListener | null = null;

    public constructor(track: Track, bikeClass: BikeClass) {
        super(track, bikeClass);

        for (const { name, key } of PLAYER_CONTROLS) {
            ControlBindings.register(name, key);
        }
    }

    public override startFrom(snapshot?: Parameters<BikeRunner['startFrom']>[0]): void {
        const endedAt = this.time;
        super.startFrom(snapshot);
        this.track.toolManager.active = false;

        // The track items are shared with the ghosts, only the player marks them as reached
        this.targetsReached.forEach((targetId) => {
            const target = this.track.targets.get(targetId);
            if (target) {
                target.reached = true;
            }
        });

        this.reachablesReached.forEach((reachableId) => {
            const reachable = this.track.reachables.get(reachableId);
            if (reachable) {
                reachable.reached = true;
            }
        });

        this.runListener?.started({
            endedAt,
            time: this.time,
            checkpoints: snapshot ? this.snapshots.indexOf(snapshot) + 1 : 0,
            bike: this.bikeClass.bikeName,
        });
    }

    protected override onHitTarget(): void {
        if (this.targetsReached.size >= this.track.targets.size && this.track.isRace()) {
            this.done = true;
        }
    }

    /**
     * Requests a checkpoint for the player and every ghost on the next physics tick, so that
     * they all restart together.
     */
    protected override onHitCheckpoint(): void {
        this.mustSave = true;
        this.track.ghostRunners.forEach((runner) => {
            runner.mustSave = true;
        });
    }

    protected updateControls(bike: Bike): void {
        let anyPressed = false;

        for (const { runnerControl, name } of PLAYER_CONTROLS) {
            const pressed = Keyboard.isDown(name);
            anyPressed ||= pressed;

            if (pressed !== this.controls[runnerControl]) {
                bike.keyLog.get(runnerControl)?.push(this.time);
                this.controls[runnerControl] = pressed;
                this.runListener?.toggled(this.time, runnerControl);
            }
        }

        if (anyPressed) {
            this.track.focalPoint = bike.hitbox;
            this.track.toolManager.active = false;
        }
    }

    public renderInstance(ctx: CanvasRenderingContext2D): void {
        this.instance?.render(ctx, 1);
    }
}
