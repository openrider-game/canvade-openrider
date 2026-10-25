import { Control, KEYA, Vector } from 'canvade';
import { InterfaceScale } from '../../numeric/interface-scale';
import { ToolIcon, ToolOption } from '../tool';
import { SCENERY_BRUSH_IMAGE, SOLID_BRUSH_IMAGE } from '../tool.constants';
import { DrawingLines } from './drawing-lines';
import { LineTool } from './line.tool';

/** Brush sizes the size option cycles through, in world units. */
const BRUSH_SIZES = [4, 10, 20, 40, 80, 160];

/**
 * Draws a line each time the mouse moves further than the brush size from the last line, solid or
 * scenery as chosen in the options (see {@link DrawingLines}).
 *
 * A stroke is undone as a whole. The size option cycles through the brush sizes; scrolling while
 * holding the tool key changes the size too, by smaller steps.
 */
export class BrushTool extends LineTool {
    public static override readonly toolName: string = 'Brush';
    public static override readonly key = new Control(KEYA);
    public static override readonly icon = SOLID_BRUSH_IMAGE;

    /** Minimum length of the drawn lines, in world units. */
    private size = 20;
    private readonly minSize = 4;
    private readonly maxSize = 200;

    public override getIcon(): ToolIcon {
        return DrawingLines.isScenery ? SCENERY_BRUSH_IMAGE : SOLID_BRUSH_IMAGE;
    }

    public override getOptions(): ToolOption[] {
        return [
            DrawingLines.option(this.track),
            {
                label: `Size: ${this.size}`,
                action: () => {
                    // The next size up, the sizes set by scrolling being between two of them
                    this.size = BRUSH_SIZES.find((size) => size > this.size) ?? BRUSH_SIZES[0];
                    this.track.invalidateUI();
                },
            },
        ];
    }

    public override onScroll(e: WheelEvent): void {
        if (this.isHolding()) {
            this.size = Math.min(
                this.maxSize,
                Math.max(this.minSize, this.size + 8 * -Math.sign(e.deltaY)),
            );
            // The size option shows it
            this.track.invalidateUI();
        } else {
            super.onScroll(e);
        }
    }

    public override onMouseDown(): void {
        // The segments of a stroke are undone together
        this.track.history.startGroup();
        super.onMouseDown();
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
            this.lastLine ??= this.track.mousePos.clone();
        }

        super.update(progress, delta);
    }

    protected override renderLineSize(ctx: CanvasRenderingContext2D, mousePx: Vector): void {
        InterfaceScale.draw(ctx, () => ctx.fillText(this.size.toString(), 3, 12), mousePx);
    }
}
