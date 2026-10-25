import { Control, CTRL, KEYD, KEYG } from 'canvade';
import { Tool } from '../tool';

/** Tool switching a track setting on and off, its button is highlighted while enabled. */
export abstract class ToggleTool extends Tool {
    public override run(): void {
        this.toggle();
    }

    /** Switches the setting. */
    protected abstract toggle(): void;
}

/** Snaps the mouse position to a grid, to draw aligned lines and items. */
export class GridSnapTool extends ToggleTool {
    public static override readonly toolName: string = 'Toggle Grid Snapping';
    public static override readonly key = new Control(KEYG);
    public static override readonly icon = 'grid';

    /** Grid size while snapping, in world units (1 means no snapping). */
    private static readonly SNAPPED_GRID_DETAIL = 10;

    protected toggle(): void {
        this.track.gridDetail = this.isToggled() ? 1 : GridSnapTool.SNAPPED_GRID_DETAIL;
    }

    public override isToggled(): boolean {
        return this.track.gridDetail !== 1;
    }
}

/** Enables or disables the debug mode, whose overlays are chosen in the debug panel. */
export class ToggleDebugTool extends ToggleTool {
    public static override readonly toolName: string = 'Toggle Debug';
    public static override readonly key = new Control(KEYD, CTRL);
    public static override readonly icon = 'debug';

    protected toggle(): void {
        this.track.debug = !this.track.debug;
        // Shows or hides the debug panel
        this.track.invalidateUI();
    }

    public override isToggled(): boolean {
        return this.track.debug;
    }
}
