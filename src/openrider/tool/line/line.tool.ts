import { Vector } from 'canvade';
import type { LineClass } from '../../item/line/line';
import { InterfaceScale } from '../../numeric/interface-scale';
import { LinePath } from '../../numeric/line-path';
import { MAX_LINE_LENGTH, MIN_LINE_LENGTH } from '../../track/track.constants';
import { Tool } from '../tool';

/** Distance to the canvas border under which the camera scrolls while drawing, in pixels. */
const EDGE_SCROLL_MARGIN = 50;

/**
 * Draws a line from the press position to the release position.
 *
 * Holding the tool key draws connected lines: each click adds a line from the end of the previous
 * one. Lines are drawn on the active layer of the track.
 */
export abstract class LineTool extends Tool {
    /** Class of the drawn lines (solid or scenery). */
    protected abstract get lineClass(): LineClass;

    /** End of the last drawn line, where the next connected line starts, in world units. */
    protected lastLine: Vector | null = null;

    public override onMouseDown(): void {
        if (this.isHolding()) {
            this.lastLine ??= this.track.mousePos.clone();
            this.addLine(this.lastLine);
        } else {
            this.mouseDown = true;
        }
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }

        this.mouseDown = false;

        if (!this.isHolding()) {
            this.addLine(this.track.lastClick);
        }
    }

    /**
     * Adds a line from a position to the mouse position, as an action that can be undone.
     *
     * Lines too short or too long are not added (a click without moving the mouse, for example),
     * the mouse position still becoming the start of the next connected line.
     *
     * @param startPos - Start of the line, in world units.
     */
    protected addLine(startPos: Vector): void {
        const line = new this.lineClass(startPos.clone(), this.track.mousePos.clone(), this.track);
        this.lastLine = this.track.mousePos.clone();

        // Such lines would never collide nor render, but would still be exported
        if (line.len < MIN_LINE_LENGTH || line.len >= MAX_LINE_LENGTH) {
            return;
        }

        line.layer = this.track.layers.reveal(this.track.layers.active);
        line.addToTrack();

        this.track.history.push({
            undo: () => line.removeFromTrack(),
            redo: () => line.addToTrack(),
        });
    }

    /** Whether the line being drawn has a valid length, measured on its longest axis. */
    private checkLineLength(): boolean {
        const measure = Math.max(
            Math.abs(this.track.lastClick.x - this.track.mousePos.x),
            Math.abs(this.track.lastClick.y - this.track.mousePos.y),
        );

        return measure >= MIN_LINE_LENGTH && measure < MAX_LINE_LENGTH;
    }

    /** Scrolls the camera when drawing near the canvas borders. */
    public override update(_progress: number, delta: number): void {
        if (!this.mouseDown && !this.isHolding()) {
            return;
        }

        const mousePx = this.track.toPixel(this.track.mousePos);
        const deltaVec = new Vector();
        const deltaFactor = delta / 4 / this.track.zoomFactor;

        if (mousePx.x < EDGE_SCROLL_MARGIN) {
            deltaVec.x = -deltaFactor;
        } else if (mousePx.x > this.track.viewWidth - EDGE_SCROLL_MARGIN) {
            deltaVec.x = deltaFactor;
        }

        if (mousePx.y < EDGE_SCROLL_MARGIN) {
            deltaVec.y = -deltaFactor;
        } else if (mousePx.y > this.track.viewHeight - EDGE_SCROLL_MARGIN) {
            deltaVec.y = deltaFactor;
        }

        this.track.camera.selfAdd(deltaVec);
        this.track.mousePos.selfAdd(deltaVec);
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        const mousePx = this.track.toPixel(this.track.mousePos);

        // Crosshair
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(mousePx.x - 10, mousePx.y);
        ctx.lineTo(mousePx.x + 10, mousePx.y);
        ctx.moveTo(mousePx.x, mousePx.y - 10);
        ctx.lineTo(mousePx.x, mousePx.y + 10);
        ctx.stroke();

        if (this.mouseDown || this.isHolding()) {
            this.renderLineInfo(ctx, mousePx);
        }

        this.renderLineSize(ctx, mousePx);
    }

    /**
     * Draws the size of the tool next to the mouse, nothing by default.
     *
     * @param mousePx - Mouse position, in canvas pixels.
     */
    protected renderLineSize(_ctx: CanvasRenderingContext2D, _mousePx: Vector): void {}

    /** Draws the line being drawn, with its length (world units) and its angle (degrees). */
    private renderLineInfo(ctx: CanvasRenderingContext2D, mousePx: Vector): void {
        ctx.save();
        ctx.strokeStyle = this.checkLineLength() ? '#00f' : '#f00';
        ctx.lineWidth = this.track.zoomFactor * 2;

        let startPos = this.track.lastClick;
        if (this.isHolding()) {
            startPos = this.lastLine ?? this.track.mousePos;
        }

        LinePath.render(ctx, [[this.track.toPixel(startPos), mousePx]]);

        const length = startPos.distanceTo(this.track.mousePos);
        const distance = this.track.mousePos.sub(startPos);
        const angle = (-Math.atan2(distance.y, distance.x) / Math.PI) * 180;

        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#777';
        // Labels in UI pixels around the cursor
        InterfaceScale.draw(
            ctx,
            () => {
                ctx.fillText(Math.round(length).toString(), 3, -3);
                ctx.textAlign = 'right';
                ctx.fillText(`${Math.round(angle)}°`, -3, -3);
            },
            mousePx,
        );
        ctx.restore();
    }
}
