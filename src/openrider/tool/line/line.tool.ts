import { Control, KEYQ, Vector } from 'canvade';
import { InterfaceScale } from '../../numeric/interface-scale';
import { LinePath } from '../../numeric/line-path';
import { MAX_LINE_LENGTH, MIN_LINE_LENGTH } from '../../track/track.constants';
import { Tool, ToolIcon, ToolOption } from '../tool';
import { lineIcon, SOLID_LINE_ICON } from '../tool-icons';
import { DrawingLines } from './drawing-lines';

/** Distance to the canvas border under which the camera scrolls while drawing, in pixels. */
const EDGE_SCROLL_MARGIN = 50;

/**
 * Draws a line from the press position to the release position, solid or scenery as chosen in
 * the options (see {@link DrawingLines}).
 *
 * Holding the tool key draws connected lines: each click adds a line from the end of the previous
 * one. Without a keyboard, the connect option does the same: each line drawn starts at the end of
 * the previous one, where a marker shows it, and ends where the pointer is released (see
 * `DrawingLines.connected`). Lines are drawn on the active layer of the track.
 */
export class LineTool extends Tool {
    public static override readonly toolName: string = 'Line';
    public static override readonly key = new Control(KEYQ);
    public static override readonly icon = SOLID_LINE_ICON;

    /** Drawn without a pointer too: the start of the next connected line, after a finger lifted. */
    public override alwaysRender = true;

    public override getIcon(): ToolIcon {
        return lineIcon(DrawingLines.strokeColor);
    }

    public override getOptions(): ToolOption[] {
        return [...DrawingLines.options(this.track), this.connectOption()];
    }

    /** The connect option, starting afresh when switched on. */
    protected connectOption(): ToolOption {
        return DrawingLines.connectOption(this.track, () => {
            this.lastLine = null;
        });
    }

    /**
     * Start of the line being drawn: the end of the previous line when connecting, the key held
     * or the option on, else the press position.
     */
    protected get lineStart(): Vector {
        if (this.isHolding()) {
            return this.lastLine ?? this.track.mousePos;
        }
        if (DrawingLines.connected && this.lastLine) {
            return this.lastLine;
        }
        return this.track.lastClick;
    }

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
            this.addLine(this.lineStart);
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
        const line = DrawingLines.create(startPos.clone(), this.track.mousePos.clone(), this.track);
        this.lastLine = this.track.mousePos.clone();

        // Such lines would never collide nor render, but would still be exported
        if (line.len < MIN_LINE_LENGTH || line.len >= MAX_LINE_LENGTH) {
            return;
        }

        line.layer = this.track.layers.reveal(this.track.layers.active);
        this.track.editor.add([line]);
    }

    /** Whether the line being drawn has a valid length, measured on its longest axis. */
    private checkLineLength(): boolean {
        const start = this.lineStart;
        const measure = Math.max(
            Math.abs(start.x - this.track.mousePos.x),
            Math.abs(start.y - this.track.mousePos.y),
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
        // The same speed on the screen whatever its pixel ratio
        const deltaFactor = delta / 4 / this.track.viewZoom;

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
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.lineCap = 'round';

        // Where the next connected line starts, also once the finger drawing it is lifted
        const connecting = DrawingLines.connected && !this.mouseDown && !this.isHolding();
        if (connecting && this.lastLine) {
            const startPx = this.track.toPixel(this.lastLine);
            ctx.beginPath();
            ctx.arc(startPx.x, startPx.y, 5, 0, 2 * Math.PI);
            ctx.stroke();
        }
        if (!this.track.toolManager.showsPointer) {
            return;
        }

        // Crosshair
        const mousePx = this.track.toPixel(this.track.mousePos);
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

        const startPos = this.lineStart;

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
