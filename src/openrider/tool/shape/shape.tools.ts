import { Control, KEYC, KEYV, Vector } from 'canvade';
import { DrawingLines } from '../line/drawing-lines';
import { ToolIcon, ToolOption } from '../tool';
import { circleIcon, curveIcon, SOLID_CIRCLE_ICON, SOLID_CURVE_ICON } from '../tool-icons';
import { ShapeTool } from './shape.tool';

/** Smallest radius of a circle, in world units: a click without dragging draws nothing. */
const MIN_CIRCLE_RADIUS = 5;

/** Shortest curve, in world units: a click without dragging starts nothing. */
const MIN_CURVE_LENGTH = 10;

/**
 * Draws a circle: pressing at its center, dragging its radius out, and releasing. It is made of
 * lines of about 20 units, 12 at least and 120 at most.
 */
export class CircleTool extends ShapeTool {
    public static override readonly toolName: string = 'Circle';
    public static override readonly key = new Control(KEYC);
    public static override readonly icon = SOLID_CIRCLE_ICON;

    public override getIcon(): ToolIcon {
        return circleIcon(DrawingLines.strokeColor);
    }

    public override onMouseDown(): void {
        this.mouseDown = true;
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }
        this.mouseDown = false;

        const points = this.points();
        if (points) {
            this.addPolyline(points);
        }
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        super.render(ctx);
        const points = this.mouseDown ? this.points() : null;
        if (points) {
            this.renderPreview(ctx, points);
        }
    }

    /** Points of the circle around the press position to the mouse, null when too small. */
    private points(): Vector[] | null {
        const center = this.track.lastClick;
        const radius = center.distanceTo(this.track.mousePos);
        if (radius < MIN_CIRCLE_RADIUS) {
            return null;
        }

        const count = ShapeTool.segments(2 * Math.PI * radius, 12, 120);
        const points = Array.from({ length: count }, (_, i) => {
            const angle = (2 * Math.PI * i) / count;
            return new Vector(
                center.x + radius * Math.cos(angle),
                center.y + radius * Math.sin(angle),
            );
        });
        // Closed on its first point exactly
        return ShapeTool.rounded([...points, points[0]]);
    }
}

/**
 * Draws a curve in two steps: dragging from its start to its end, then clicking where the curve
 * passes, halfway along it. The curve is a quadratic Bézier curve, made of lines of about 20
 * units, 2 at least and 64 at most.
 */
export class CurveTool extends ShapeTool {
    public static override readonly toolName: string = 'Curve';
    public static override readonly key = new Control(KEYV);
    public static override readonly icon = SOLID_CURVE_ICON;

    public override getIcon(): ToolIcon {
        return curveIcon(DrawingLines.strokeColor);
    }

    /** Start and end of the curve, set once dragged, until it is bent. */
    private ends: { start: Vector; end: Vector } | null = null;

    public override deactivate(): void {
        super.deactivate();
        this.restart();
    }

    public override onMouseDown(): void {
        this.mouseDown = true;
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }
        this.mouseDown = false;

        if (this.ends) {
            this.addPolyline(CurveTool.points(this.ends.start, this.ends.end, this.track.mousePos));
            this.restart();
            return;
        }

        const start = this.track.lastClick.clone();
        const end = this.track.mousePos.clone();
        if (start.distanceTo(end) >= MIN_CURVE_LENGTH) {
            this.ends = { start, end };
            this.track.invalidateUI();
        }
    }

    protected override getShapeOptions(): ToolOption[] {
        return [
            {
                label: this.ends
                    ? 'Next: click where the curve passes'
                    : 'Next: drag from its start to its end',
                action: () => this.restart(),
            },
        ];
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        super.render(ctx);
        const mousePos = this.track.mousePos;
        if (this.ends) {
            this.renderPreview(ctx, CurveTool.points(this.ends.start, this.ends.end, mousePos));
        } else if (this.mouseDown) {
            this.renderPreview(ctx, [this.track.lastClick, mousePos]);
        }
    }

    /** Starts a new curve. */
    private restart(): void {
        this.ends = null;
        this.track.invalidateUI();
    }

    /**
     * Points of the curve from a start to an end passing through a point halfway along it: its
     * control point is twice as far from the middle of its ends.
     */
    private static points(start: Vector, end: Vector, through: Vector): Vector[] {
        const control = through.scale(2).sub(start.add(end).scale(0.5));
        const length = start.distanceTo(control) + control.distanceTo(end);
        const count = ShapeTool.segments(length, 2, 64);
        const points = Array.from({ length: count + 1 }, (_, i) => {
            const t = i / count;
            return start
                .scale((1 - t) ** 2)
                .add(control.scale(2 * (1 - t) * t))
                .add(end.scale(t ** 2));
        });
        return ShapeTool.rounded(points);
    }
}
