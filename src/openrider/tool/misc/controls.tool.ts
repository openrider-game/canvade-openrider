import { Control, CTRL, KEYK } from 'canvade';
import { Tool } from '../tool';

/**
 * Opens or closes the controls panel, binding the controls to other keys. The game is paused
 * while it is open, and resumes on closing if it was running. Hidden on touch screens.
 */
export class ControlsTool extends Tool {
    public static override readonly toolName: string = 'Controls';
    public static override readonly key = new Control(KEYK, CTRL);
    public static override readonly icon = 'keyboard';
    public static override readonly keyboardOnly = true;

    /** Whether the game was paused when the panel opened. */
    private wasPaused = false;

    public override run(): void {
        const track = this.track;
        track.controlsOpen = !track.controlsOpen;
        if (track.controlsOpen) {
            this.wasPaused = track.paused;
            track.pause(true);
        } else if (!this.wasPaused) {
            track.pause(false);
        }
        track.invalidateUI();
    }

    public override isToggled(): boolean {
        return this.track.controlsOpen;
    }
}
