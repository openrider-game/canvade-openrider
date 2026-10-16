import { ARROWDOWN, ARROWLEFT, ARROWRIGHT, ARROWUP, Control, Keyboard, KEYZ, NONE } from 'canvade';
import type { Track } from '../../track/track';
import { Bike, BikeClass } from '../bike';
import { BikeRunner } from './bike-runner';
import { ControlName } from './runner-controls';

/** Runner control, keyboard control name and default key of each player control. */
const PLAYER_CONTROLS: Array<[ControlName, string, Control]> = [
    ['upPressed', 'Up', new Control(ARROWUP)],
    ['downPressed', 'Down', new Control(ARROWDOWN)],
    ['leftPressed', 'Left', new Control(ARROWLEFT)],
    ['rightPressed', 'Right', new Control(ARROWRIGHT)],
    ['turnPressed', 'Z', new Control(KEYZ, NONE, true)],
];

/**
 * Runner driven by the keyboard. Every control change is recorded in the bike key log, with
 * the track time in physics ticks, to generate the ghost of the run.
 */
export class PlayerRunner extends BikeRunner {
    public readonly isGhost = false;

    public constructor(track: Track, bikeClass: BikeClass) {
        super(track, bikeClass);

        for (const [, controlName, control] of PLAYER_CONTROLS) {
            Keyboard.registerControl(controlName, control);
        }
    }

    public override startFrom(snapshot?: Parameters<BikeRunner['startFrom']>[0]): void {
        super.startFrom(snapshot);

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

        for (const [name, controlName] of PLAYER_CONTROLS) {
            const pressed = Keyboard.isDown(controlName);
            anyPressed ||= pressed;

            if (pressed !== this.controls[name]) {
                bike.keyLog.get(name)?.push(this.track.time);
                this.controls[name] = pressed;
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
