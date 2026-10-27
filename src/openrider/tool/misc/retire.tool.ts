import { BACKSPACE, Control } from 'canvade';
import { Tool } from '../tool';

/**
 * Retires the run of the player in endurance mode, e.g. stuck in a zone without gravity: it ends
 * as if the rider crashed, its distance being saved (see `Track.retireRun`).
 *
 * Hidden on touch screens, where restarting retires the run as well (see `RestartTool`).
 */
export class RetireTool extends Tool {
    public static override readonly toolName: string = 'Retire';
    public static override readonly key = new Control(BACKSPACE);
    public static override readonly icon = 'retire';
    public static override readonly keyboardOnly = true;

    public override run(): void {
        this.track.retireRun?.();
    }
}
