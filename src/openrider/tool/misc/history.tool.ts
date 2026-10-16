import { Control, KEYM, KEYN } from 'canvade';
import { Tool } from '../tool';

/** Undoes the last editor action. */
export class UndoTool extends Tool {
    public static override readonly toolName: string = 'Undo';
    public static override readonly keyLabel: string = 'M';
    public static override readonly key = new Control(KEYM);
    public static override readonly icon = 'undo';

    public override run(): void {
        this.track.history.undo();
    }
}

/** Redoes the last undone editor action. */
export class RedoTool extends Tool {
    public static override readonly toolName: string = 'Redo';
    public static override readonly keyLabel: string = 'N';
    public static override readonly key = new Control(KEYN);
    public static override readonly icon = 'redo';

    public override run(): void {
        this.track.history.redo();
    }
}
