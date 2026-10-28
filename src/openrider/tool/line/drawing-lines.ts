import type { Vector } from 'canvade';
import { SOLID_STROKE_STYLE } from '../../grid/cell/render-cell';
import type { Line, LineClass } from '../../item/line/line';
import { SCENERY_COLORS, sceneryColor } from '../../item/line/scenery-colors';
import { SceneryLine } from '../../item/line/scenery-line';
import { SolidLine } from '../../item/line/solid-line';
import type { Track } from '../../track/track';
import type { ToolOption } from '../tool';

/**
 * Kind of the lines drawn by the drawing tools (brush, line and shapes): solid lines, on which the
 * bikes ride, or scenery lines, only decorative, in a color of `SCENERY_COLORS`. Chosen in the
 * options of any of them, the kind and the color are shared by them all.
 *
 * Also whether the line and brush tools connect their lines, see {@link DrawingLines.connected}.
 */
export abstract class DrawingLines {
    private static scenery = false;
    private static colorIndex = 0;
    private static connect = false;

    /**
     * Whether the line and brush tools start each line or stroke at the end of the previous one,
     * as when holding their key: the way to draw connected lines on touch screens.
     */
    public static get connected(): boolean {
        return DrawingLines.connect;
    }

    /** Connects the lines of the line and brush tools or not, e.g. in the tests. */
    public static setConnected(connected: boolean): void {
        DrawingLines.connect = connected;
    }

    /**
     * Option of the line and brush tools connecting their lines.
     *
     * @param restart - Called when switched on, so that the next line starts afresh.
     */
    public static connectOption(track: Track, restart: () => void): ToolOption {
        return {
            label: `Connect: ${DrawingLines.connect ? 'on' : 'off'}`,
            action: () => {
                DrawingLines.connect = !DrawingLines.connect;
                if (DrawingLines.connect) {
                    restart();
                }
                track.invalidateUI();
            },
        };
    }

    /** Whether the drawing tools draw scenery lines, else solid lines. */
    public static get isScenery(): boolean {
        return DrawingLines.scenery;
    }

    /** Class of the drawn lines. */
    public static get lineClass(): LineClass {
        return DrawingLines.scenery ? SceneryLine : SolidLine;
    }

    /** Color of the drawn scenery lines, see `Line.color`. */
    public static get color(): number {
        return DrawingLines.colorIndex;
    }

    /** Color the drawn lines are shown in: of the scenery, else null for the solid lines. */
    public static get strokeColor(): number | null {
        return DrawingLines.scenery ? DrawingLines.colorIndex : null;
    }

    /** Stroke style of the drawn lines, e.g. for a preview. */
    public static get strokeStyle(): string {
        return DrawingLines.scenery ? sceneryColor(DrawingLines.colorIndex) : SOLID_STROKE_STYLE;
    }

    /** Draws solid or scenery lines, e.g. in the tests. */
    public static setScenery(scenery: boolean): void {
        DrawingLines.scenery = scenery;
    }

    /** Draws scenery lines of a color, wrapping around the colors. */
    public static setColor(color: number): void {
        const count = SCENERY_COLORS.length;
        DrawingLines.colorIndex = ((color % count) + count) % count;
    }

    /** A line of the drawn kind and color, not added to the track. */
    public static create(pos: Vector, endPos: Vector, track: Track): Line {
        const line = new DrawingLines.lineClass(pos, endPos, track);
        if (DrawingLines.scenery) {
            line.color = DrawingLines.colorIndex;
        }
        return line;
    }

    /**
     * Options of the drawing tools: switching the kind of lines, then for scenery lines their
     * color, picked from the swatches of the colors.
     */
    public static options(track: Track): ToolOption[] {
        // The options and the icons of the tools show the kind and the color
        const update = (change: () => void) => () => {
            change();
            track.invalidateUI();
        };
        const kind: ToolOption = {
            label: `Lines: ${DrawingLines.scenery ? 'scenery' : 'solid'}`,
            action: update(() => (DrawingLines.scenery = !DrawingLines.scenery)),
        };
        if (!DrawingLines.scenery) {
            return [kind];
        }

        const color = DrawingLines.colorIndex;
        return [
            kind,
            {
                label: `Color: ${SCENERY_COLORS[color].name}`,
                action: update(() => DrawingLines.setColor(color + 1)),
                swatches: {
                    colors: SCENERY_COLORS.map((entry) => entry.color),
                    selected: color,
                    select: (index) => update(() => DrawingLines.setColor(index))(),
                },
            },
        ];
    }
}
