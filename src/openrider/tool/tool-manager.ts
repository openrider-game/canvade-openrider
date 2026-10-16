import type { Track } from '../track/track';
import type { Tool } from './tool';

const RIGHT_BUTTON = 2;

/**
 * Holds the current tool of a track and forwards it the mouse events of the canvas.
 *
 * The camera tool is always available with the right mouse button, whatever the current tool.
 */
export class ToolManager {
    /** Current tool, receiving the mouse events, `null` until a tool is selected. */
    public tool: Tool | null = null;
    /**
     * Set when the mouse is used, reset when the player rides.
     *
     * The current tool is only updated and rendered while active, so that its preview disappears
     * when the player takes control of the bike.
     */
    public active = false;
    private cameraTool: Tool | null = null;

    public constructor(private readonly track: Track) {}

    /** Selects a tool and rebuilds the interface, selecting the current tool again does nothing. */
    public setTool(tool: Tool): void {
        if (tool === this.tool) {
            return;
        }

        this.tool?.deactivate();
        this.tool = tool;
        this.tool.activate();
        this.track.invalidateUI();
    }

    /** Sets the tool receiving the right mouse button events, `null` to disable it. */
    public setCamera(cameraTool: Tool | null): void {
        this.cameraTool = cameraTool;
    }

    public fixedUpdate(): void {
        if (this.tool && this.active) {
            this.tool.fixedUpdate();
        }
    }

    public update(progress: number, delta: number): void {
        if (this.tool && this.active) {
            this.tool.update(progress, delta);
        }
    }

    public render(ctx: CanvasRenderingContext2D): void {
        if (this.tool && (this.allowRender() || this.tool.alwaysRender)) {
            this.tool.render(ctx);
        }
    }

    public onMouseDown(e: MouseEvent): void {
        if (this.tool && e.button !== RIGHT_BUTTON) {
            this.active = true;
            this.tool.onMouseDown(e);
        }

        if (this.cameraTool && this.tool !== this.cameraTool && e.button === RIGHT_BUTTON) {
            this.cameraTool.onMouseDown(e);
        }
    }

    public onMouseUp(e: MouseEvent): void {
        if (this.tool) {
            this.active = true;
            this.tool.onMouseUp(e);
        }

        if (this.cameraTool && this.tool !== this.cameraTool) {
            this.cameraTool.onMouseUp(e);
        }
    }

    public onMouseMove(e: MouseEvent): void {
        if (this.tool) {
            this.active = true;
            this.tool.onMouseMove(e);
        }

        if (this.cameraTool && this.tool !== this.cameraTool) {
            this.cameraTool.onMouseMove(e);
        }
    }

    public onScroll(e: WheelEvent): void {
        if (this.tool) {
            this.active = true;
            this.tool.onScroll(e);
        }
    }

    /** Only marks the manager as active, the right button itself is handled by the camera tool. */
    public onContextMenu(): void {
        if (this.tool) {
            this.active = true;
        }
    }

    private allowRender(): boolean {
        return this.track.mouseIn && !this.track.uiHovered && this.active;
    }
}
