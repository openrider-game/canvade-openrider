import { Control, ENTER } from 'canvade';
import { Tool } from '../tool';

/**
 * Restarts from the last checkpoint, retiring the run first where runs can be retired (see
 * `Track.retireRun`), so that it is saved.
 */
export class RestartTool extends Tool {
    public static override readonly toolName: string = 'Restart';
    public static override readonly key = new Control(ENTER);
    public static override readonly icon = 'restart';

    public override run(): void {
        this.track.retireRun?.();
        this.track.restart();
    }
}
