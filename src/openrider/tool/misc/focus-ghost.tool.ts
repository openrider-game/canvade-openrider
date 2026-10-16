import { Control, CTRL, KEYG } from 'canvade';
import { Tool } from '../tool';

/** Cycles the camera through the ghosts, starting again from the first one after the player. */
export class FocusGhostTool extends Tool {
    public static override readonly toolName: string = 'Focus ghost';
    public static override readonly keyLabel: string = 'Control+G';
    public static override readonly key = new Control(KEYG, CTRL);
    public static override readonly icon = 'focus';

    private currentGhostIndex = 0;

    public override run(): void {
        const track = this.track;
        if (track.focalPoint === null || track.focalPoint === track.playerRunner.instance?.hitbox) {
            this.currentGhostIndex = 0;
        }

        if (track.ghostRunners.size) {
            this.currentGhostIndex = (this.currentGhostIndex + 1) % track.ghostRunners.size;
            const ghost = Array.from(track.ghostRunners.values())[this.currentGhostIndex];
            track.focalPoint = ghost.instance?.hitbox ?? track.focalPoint;
        }
    }
}
