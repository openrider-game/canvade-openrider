import { Control, KEYA, Vector } from 'canvade';
import { InterfaceScale } from '../../numeric/interface-scale';
import { sizeOption, ToolIcon, ToolOption } from '../tool';
import { SCENERY_BRUSH_ICON, SOLID_BRUSH_ICON } from '../tool-icons';
import { DrawingLines } from './drawing-lines';
import { LineTool } from './line.tool';

/** Brush sizes the size option steps through, in world units. */
const BRUSH_SIZES = [4, 10, 20, 40, 80, 160];

/**
 * Draws a line each time the mouse moves further than the brush size from the last line, solid or
 * scenery as chosen in the options (see {@link DrawingLines}).
 *
 * A stroke is undone as a whole. The size is set in the options, see {@link sizeOption}. With the
 * connect option, each stroke starts at the end of the previous one (see `DrawingLines.connected`),
 * as when moving the mouse with the tool key held.
 */
export class BrushTool extends LineTool {
    public static override readonly toolName: string = 'Brush';
    public static override readonly key = new Control(KEYA);
    public static override readonly icon = SOLID_BRUSH_ICON;

    /** Minimum length of the drawn lines, in world units. */
    private size = 20;

    public override getIcon(): ToolIcon {
        return DrawingLines.isScenery ? SCENERY_BRUSH_ICON : SOLID_BRUSH_ICON;
    }

    public override getOptions(): ToolOption[] {
        return [
            DrawingLines.option(this.track),
            this.connectOption(),
            sizeOption(this.size, BRUSH_SIZES, (size) => {
                this.size = size;
                this.track.invalidateUI();
            }),
        ];
    }

    public override onMouseDown(): void {
        // The segments of a stroke are undone together
        this.track.history.startGroup();
        super.onMouseDown();
        // Connected: the stroke goes on from the end of the previous one
        if (this.mouseDown && DrawingLines.connected && this.lastLine) {
            this.track.lastClick = this.lastLine.clone();
        }
    }

    public override onMouseUp(): void {
        super.onMouseUp();
        this.track.history.endGroup();
    }

    public override update(progress: number, delta: number): void {
        const holding = this.isHolding();

        if (this.mouseDown || (holding && this.lastLine !== null)) {
            const startPos = holding && this.lastLine ? this.lastLine : this.track.lastClick;

            if (startPos.distanceTo(this.track.mousePos) >= this.size) {
                // Strokes drawn while holding the tool key last until the key is released
                this.track.history.startGroup();
                this.addLine(startPos);
                this.track.lastClick = this.track.mousePos.clone();
            }
        } else {
            this.track.history.endGroup();
            // Holding the key draws from the cursor, while the option waits for a stroke
            if (holding || !DrawingLines.connected) {
                this.lastLine ??= this.track.mousePos.clone();
            }
        }

        super.update(progress, delta);
    }

    protected override renderLineSize(ctx: CanvasRenderingContext2D, mousePx: Vector): void {
        InterfaceScale.draw(ctx, () => ctx.fillText(this.size.toString(), 3, 12), mousePx);
    }
}
