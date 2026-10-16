import { Control, KEYF } from 'canvade';
import { Tool } from '../tool';

/** Toggles the fullscreen mode on the element hosting the game canvas. */
export class FullscreenTool extends Tool {
    public static override readonly toolName: string = 'Toggle Fullscreen';
    public static override readonly keyLabel: string = 'F';
    public static override readonly key = new Control(KEYF);
    public static override readonly icon = 'expand';

    public override run(): void {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void this.track.canvas?.parentElement?.requestFullscreen();
        }
    }
}
