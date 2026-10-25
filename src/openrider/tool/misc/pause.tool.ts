import { Control, SPACE } from 'canvade';
import { Tool, ToolIcon } from '../tool';

/** Pauses or resumes the game, its button showing the action it will do. */
export class PauseTool extends Tool {
    public static override readonly toolName: string = 'Pause';
    public static override readonly key = new Control(SPACE);
    public static override readonly icon = 'pause';

    public override run(): void {
        this.track.pause(!this.track.paused);
    }

    public override getIcon(): ToolIcon {
        return this.track.paused ? 'play' : 'pause';
    }

    public override getLabel(): string {
        return this.track.paused ? 'Unpause' : 'Pause';
    }
}
