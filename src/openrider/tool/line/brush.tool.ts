import { Vector } from 'canvade';
import { InterfaceScale } from '../../numeric/interface-scale';
import { LineTool } from './line.tool';

/**
 * Draws a line each time the mouse moves further than the brush size from the last line.
 *
 * A stroke is undone as a whole. Scrolling while holding the tool key changes the brush size.
 */
export abstract class BrushTool extends LineTool {
    /** Minimum length of the drawn lines, in world units. */
    private size = 20;
    private readonly minSize = 4;
    private readonly maxSize = 200;

    public override onScroll(e: WheelEvent): void {
        if (this.isHolding()) {
            this.size = Math.min(
                this.maxSize,
                Math.max(this.minSize, this.size + 8 * -Math.sign(e.deltaY)),
            );
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
