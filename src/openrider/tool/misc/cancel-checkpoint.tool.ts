import { BACKSPACE, Control } from 'canvade';
import { Tool } from '../tool';

/** Goes back to the checkpoint before the last one, for the player and the ghosts. */
export class CancelCheckpointTool extends Tool {
    public static override readonly toolName: string = 'Cancel Checkpoint';
    public static override readonly keyLabel: string = 'Backspace';
    public static override readonly key = new Control(BACKSPACE);
    public static override readonly icon = 'rewind';

    public override run(): void {
        this.track.playerRunner.popCheckpoint();
        this.track.ghostRunners.forEach((runner) => runner.popCheckpoint());
        this.track.restart();
    }
}
