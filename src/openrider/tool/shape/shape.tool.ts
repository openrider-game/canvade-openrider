import { Vector } from 'canvade';
import { SCENERY_STROKE_STYLE, SOLID_STROKE_STYLE } from '../../grid/cell/render-cell';
import type { LineClass } from '../../item/line/line';
import { LinePath } from '../../numeric/line-path';
import { MAX_LINE_LENGTH, MIN_LINE_LENGTH } from '../../track/track.constants';
import { DrawingLines } from '../line/drawing-lines';
import { Tool, ToolOption } from '../tool';

/** Length of the lines drawing a shape, in world units: short enough to look smooth. */
export const SHAPE_SEGMENT_LENGTH = 20;

/**
 * Draws a shape as connected lines on the active layer of the track, solid or scenery lines as
 * chosen in the options, the choice being shared by the drawing tools (see {@link DrawingLines}).
 * A shape is added and undone at once.
 *
 * The points of the shapes are rounded to whole world units, as the track codes write them: a
 * shape saved and loaded again is the one drawn.
 */
export abstract class ShapeTool extends Tool {
    /** Class of the drawn lines. */
    protected get lineClass(): LineClass {
        return DrawingLines.lineClass;
    }

    public override getOptions(): ToolOption[] {
        return [DrawingLines.option(this.track), ...this.getShapeOptions()];
    }

    /** Options of the shape, after the kind of lines. */
    protected getShapeOptions(): ToolOption[] {
        return [];
    }

    /**
     * Adds a line between each two following points, as one action that can be undone. Lines too
     * short or too long are left out.
     *
     * @param points - Points of the shape, in world units.
     * @returns The number of lines added.
     */
    protected addPolyline(points: Vector[]): number {
        const layer = this.track.layers.reveal(this.track.layers.active);
        const lines = points
            .slice(1)
            .map((point, i) => new this.lineClass(points[i].clone(), point.clone(), this.track))
            .filter((line) => line.len >= MIN_LINE_LENGTH && line.len < MAX_LINE_LENGTH);
        if (lines.length === 0) {
            return 0;
        }

        for (const line of lines) {
            line.layer = layer;
            line.addToTrack();
        }
        this.track.history.push({
            undo: () => lines.forEach((line) => line.removeFromTrack()),
            redo: () => lines.forEach((line) => line.addToTrack()),
        });
        return lines.length;
    }

    /** Draws the crosshair at the mouse position. */
    public override render(ctx: CanvasRenderingContext2D): void {
        const mousePx = this.track.toPixel(this.track.mousePos);
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mousePx.x - 10, mousePx.y);
        ctx.lineTo(mousePx.x + 10, mousePx.y);
        ctx.moveTo(mousePx.x, mousePx.y - 10);
        ctx.lineTo(mousePx.x, mousePx.y + 10);
        ctx.stroke();
        ctx.restore();
    }

    /** Draws the lines a shape would add, in the color of their kind. */
    protected renderPreview(ctx: CanvasRenderingContext2D, points: Vector[]): void {
        ctx.save();
        ctx.lineWidth = Math.max(2 * this.track.zoomFactor, 0.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = DrawingLines.isScenery ? SCENERY_STROKE_STYLE : SOLID_STROKE_STYLE;
        LinePath.render(ctx, [points.map((point) => this.track.toPixel(point))]);
        ctx.restore();
    }

    /** Points rounded to whole world units, without the repeated ones the rounding makes. */
    protected static rounded(points: Vector[]): Vector[] {
        const result: Vector[] = [];
        for (const point of points) {
            // Without -0, e.g. a tiny negative coordinate rounded
            const rounded = new Vector(Math.round(point.x) || 0, Math.round(point.y) || 0);
            const last = result[result.length - 1];
            if (!last || last.x !== rounded.x || last.y !== rounded.y) {
                result.push(rounded);
            }
        }
        return result;
    }

    /** Number of lines drawing a shape of a length, between a minimum and a maximum. */
    protected static segments(length: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, Math.round(length / SHAPE_SEGMENT_LENGTH)));
    }
}
