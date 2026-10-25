import { Control, KEYR } from 'canvade';
import { Tool } from '../tool';

/**
 * Drags the camera around.
 *
 * Also receives the right mouse button events from the `ToolManager`, whatever the current
 * tool is.
 */
export class CameraTool extends Tool {
    public static override readonly toolName: string = 'Camera';
    public static override readonly key = new Control(KEYR);
    public static override readonly icon = 'arrows';

    public override activate(): void {
        this.track.cursor = 'move';
    }

    public override onMouseMove(e: MouseEvent): void {
        if (this.mouseDown) {
            super.onMouseMove(e);
            this.track.camera.selfAdd(this.track.lastClick.sub(this.track.mousePos));
            this.track.mousePos.set(this.track.lastClick);
        }
    }
}
