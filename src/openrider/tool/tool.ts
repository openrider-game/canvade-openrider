import { Control, Keyboard } from 'canvade';
import type { Track } from '../track/track';
import type { ToolGroupTool } from './group/tool-group.tool';

/** Name of an svg icon in `media/icon`, or an inline base64 image (data URL). */
export type ToolIcon = string | { type: 'b64'; data: string };

/**
 * Constructor of a concrete {@link Tool}, with the static metadata used to build its toolbar button
 * and register its keyboard shortcut.
 */
export interface ToolClass {
    new (track: Track): Tool;
    /** Unique name of the tool, used as its default label and to look it up in a collection. */
    readonly toolName: string;
    /** Name of the keyboard control, also displayed in the tooltip (e.g. `Shift+T`). */
    readonly keyLabel: string | null;
    /** Keyboard shortcut running the tool, `null` if it has none. */
    readonly key: Control | null;
    /** Icon of the toolbar button, `null` if the tool has no button. */
    readonly icon: ToolIcon | null;
}

/** Button displayed in the options panel of a tool. */
export interface ToolOption {
    label: string;
    action(): void;
}

/**
 * Action available from a toolbar button or a keyboard shortcut.
 *
 * Tools either act once when run (pause, restart, toggles...), by overriding {@link Tool.run}, or
 * become the current tool of the track's `ToolManager` and receive the mouse events. Concrete
 * tools describe themselves with static metadata (see {@link ToolClass}).
 */
export abstract class Tool {
    /** See {@link ToolClass.toolName}. */
    public static readonly toolName: string = 'Tool';
    /** See {@link ToolClass.keyLabel}. */
    public static readonly keyLabel: string | null = null;
    /** See {@link ToolClass.key}. */
    public static readonly key: Control | null = null;
    /** See {@link ToolClass.icon}. */
    public static readonly icon: ToolIcon | null = null;

    /** Whether a mouse button pressed on the canvas is held down. */
    public mouseDown = false;
    /** Render the tool even when the mouse is out of the canvas or over the interface. */
    public alwaysRender = false;
    /**
     * Whether the options panel of the tool is displayed.
     *
     * Change it through {@link Tool.openOptions} and {@link Tool.closeOptions}, which rebuild the
     * interface.
     */
    public optionsOpen = false;
    /** Group the tool belongs to, `null` if its button is directly in the toolbar. */
    public group: ToolGroupTool | null = null;

    public constructor(public readonly track: Track) {}

    /** Constructor of the tool, giving access to its static metadata. */
    public get toolClass(): ToolClass {
        return this.constructor as ToolClass;
    }

    /** Registers the keyboard shortcut of the tool, if it has one. */
    public registerControls(): void {
        const { keyLabel, key } = this.toolClass;
        if (keyLabel !== null && key !== null) {
            Keyboard.registerControl(keyLabel, key);
        }
    }

    /** Whether the keyboard shortcut of the tool is currently held down. */
    public isHolding(): boolean {
        const keyLabel = this.toolClass.keyLabel;
        return keyLabel !== null && Keyboard.isDown(keyLabel);
    }

    public getIcon(): ToolIcon | null {
        return this.toolClass.icon;
    }

    /** Label of the toolbar button, the tool name unless overridden. */
    public getLabel(): string {
        return this.toolClass.toolName;
    }

    /** Whether the tool button is highlighted as the current tool. */
    public isActive(): boolean {
        return this.track.toolManager.tool === this;
    }

    /** Whether the tool button is highlighted as an enabled toggle. */
    public isToggled(): boolean {
        return false;
    }

    /**
     * Runs the tool, from its toolbar button or its keyboard shortcut.
     *
     * By default, makes it the current tool (and the selected tool of its group), or toggles its
     * options panel if it already is. Tools acting once override it.
     */
    public run(): void {
        if (this.group) {
            this.group.currentInstance = this;
        }
        this.track.toolManager.setTool(this);
    }

    /**
     * Buttons of the options panel, read each time the interface is rebuilt.
     *
     * An option changing what this returns must call `track.invalidateUI()` to refresh the panel.
     */
    public getOptions(): ToolOption[] {
        return [];
    }

    /** Displays the options panel and rebuilds the interface. */
    public openOptions(): void {
        this.optionsOpen = true;
        this.track.invalidateUI();
    }

    /** Hides the options panel and rebuilds the interface. */
    public closeOptions(): void {
        this.optionsOpen = false;
        this.track.invalidateUI();
    }

    /**
     * Called by the `ToolManager` when the tool becomes the current tool: opens its options
     * (and those of its group) and hides the cursor.
     */
    public activate(): void {
        this.group?.openOptions();
        this.track.cursor = 'none';
        this.openOptions();
    }

    /**
     * Called by the `ToolManager` when another tool becomes the current tool: closes the
     * options and ends the pending history group.
     */
    public deactivate(): void {
        this.group?.closeOptions();
        this.closeOptions();
        this.mouseDown = false;
        // A gesture interrupted by a tool change is still undone as a whole
        this.track.history.endGroup();
    }

    public onMouseDown(_e: MouseEvent): void {
        this.mouseDown = true;
    }

    public onMouseUp(_e: MouseEvent): void {
        this.mouseDown = false;
    }

    /** Handles a mouse move on the canvas, by default stops the camera following a bike. */
    public onMouseMove(_e: MouseEvent): void {
        this.track.focalPoint = null;
    }

    /** Zooms in or out, centered on the followed bike if any, otherwise on the mouse. */
    public onScroll(e: WheelEvent): void {
        const pos = this.track.focalPoint ? this.track.focalPoint.displayPos : this.track.mousePos;
        this.track.zoomAt(pos, -Math.sign(e.deltaY));
    }

    /** Called on each physics tick while the tool is current and `ToolManager.active`. */
    public fixedUpdate(): void {}
    /** Called on each frame while the tool is current and `ToolManager.active`. */
    public update(_progress: number, _delta: number): void {}
    /**
     * Draws the tool over the track, in canvas pixels (convert world positions with
     * `track.toPixel`).
     *
     * Only called while the mouse is over the canvas, outside the interface, and the
     * `ToolManager` is active, unless {@link Tool.alwaysRender} is set.
     */
    public render(_ctx: CanvasRenderingContext2D): void {}
}
