import { Control, ENTER } from 'canvade';
import { Tool } from '../tool';

/** Restarts from the last checkpoint. */
export class RestartTool extends Tool {
    public static override readonly toolName: string = 'Restart';
    public static override readonly key = new Control(ENTER);
    public static override readonly icon = 'restart';

    public override run(): void {
        this.track.restart();
    }
}
