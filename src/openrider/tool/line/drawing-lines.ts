import type { LineClass } from '../../item/line/line';
import { SceneryLine } from '../../item/line/scenery-line';
import { SolidLine } from '../../item/line/solid-line';
import type { Track } from '../../track/track';
import type { ToolOption } from '../tool';

/**
 * Kind of the lines drawn by the drawing tools (brush, line and shapes): solid lines, on which the
 * bikes ride, or scenery lines, only decorative. Chosen in the options of any of them, the kind is
 * shared by them all.
 */
export abstract class DrawingLines {
    private static scenery = false;

    /** Whether the drawing tools draw scenery lines, else solid lines. */
    public static get isScenery(): boolean {
        return DrawingLines.scenery;
    }

    /** Class of the drawn lines. */
    public static get lineClass(): LineClass {
        return DrawingLines.scenery ? SceneryLine : SolidLine;
    }

    /** Draws solid or scenery lines, e.g. in the tests. */
    public static setScenery(scenery: boolean): void {
        DrawingLines.scenery = scenery;
    }

    /** Option of the drawing tools switching the kind of lines. */
    public static option(track: Track): ToolOption {
        return {
            label: `Lines: ${DrawingLines.scenery ? 'scenery' : 'solid'}`,
            action: () => {
                DrawingLines.scenery = !DrawingLines.scenery;
                // The options and the icons of the tools show the kind
                track.invalidateUI();
            },
        };
    }
}
