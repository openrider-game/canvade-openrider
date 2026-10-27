import { Control, Keyboard } from 'canvade';
import { ControlBindings } from '../controls/control-bindings';
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
    /**
     * Unique name of the tool, used as its default label, to look it up in a collection, and as
     * the name of its keyboard control.
     */
    readonly toolName: string;
    /**
     * Default keyboard shortcut running the tool, `null` if it has none; the player can bind it
     * to another key (see `ControlBindings`).
     */
    readonly key: Control | null;
    /** Icon of the toolbar button, `null` if the tool has no button. */
    readonly icon: ToolIcon | null;
    /** Whether the tool is only of use with a keyboard, its button being hidden on touch screens. */
    readonly keyboardOnly: boolean;
}

/** Button displayed in the options drawer while its tool is the current tool. */
export interface ToolOption {
    label: string;
    /** Called when the option is clicked: e.g. switching it, or its next value. */
    action(): void;
    /**
     * Steps the value of the option down and up, e.g. a size, with `−` and `+` buttons beside its
     * label: the way to set it on every screen, touch screens included.
     */
    steps?: { down(): void; up(): void };
}

/**
 * The option of a size stepped through a list of sizes: `−` and `+` step down and up, clicking
 * it goes to the next one, the smallest after the largest.
 *
 * @param set - Sets the size, the interface then showing it.
 */
export function sizeOption(
    size: number,
    sizes: readonly number[],
    set: (size: number) => void,
): ToolOption {
    const next = sizes.find((value) => value > size);
    return {
        label: `Size: ${size}`,
        action: () => set(next ?? sizes[0]),
        steps: {
            down: () => set([...sizes].reverse().find((value) => value < size) ?? sizes[0]),
            up: () => set(next ?? sizes[sizes.length - 1]),
        },
    };
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
    /** See {@link ToolClass.key}. */
    public static readonly key: Control | null = null;
    /** See {@link ToolClass.icon}. */
    public static readonly icon: ToolIcon | null = null;
    /** See {@link ToolClass.keyboardOnly}. */
    public static readonly keyboardOnly: boolean = false;

    /** Whether a mouse button pressed on the canvas is held down. */
    public mouseDown = false;
    /** Render the tool even when the mouse is out of the canvas or over the interface. */
    public alwaysRender = false;
    /** Group the tool belongs to, `null` if its button is directly in the toolbar. */
    public group: ToolGroupTool | null = null;

    public constructor(public readonly track: Track) {}

    /** Constructor of the tool, giving access to its static metadata. */
    public get toolClass(): ToolClass {
        return this.constructor as ToolClass;
    }

    /**
     * Registers the keyboard shortcut of the tool, if it has one, named after the tool, with the
     * key the player bound it to.
     */
    public registerControls(): void {
        const { toolName, key } = this.toolClass;
        if (key !== null) {
            ControlBindings.register(toolName, key);
        }
    }

    /** Whether the keyboard shortcut of the tool is currently held down. */
    public isHolding(): boolean {
        const { toolName, key } = this.toolClass;
        return key !== null && Keyboard.isDown(toolName);
    }

    /** Readable key of the shortcut of the tool, e.g. `Shift+T`, null without one. */
    public getKeyLabel(): string | null {
        const { toolName, key } = this.toolClass;
        return key === null ? null : (ControlBindings.label(toolName) ?? key.label);
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
     * By default, makes it the current tool (and the selected tool of its group). Tools acting
     * once override it.
     */
    public run(): void {
        if (this.group) {
            this.group.currentInstance = this;
        }
        this.track.toolManager.setTool(this);
    }

    /**
     * Buttons of the options drawer, read each time the interface is rebuilt.
     *
     * An option changing what this returns must call `track.invalidateUI()` to refresh the
     * drawer.
     */
    public getOptions(): ToolOption[] {
        return [];
    }

    /** Called by the `ToolManager` when the tool becomes the current tool: hides the cursor. */
    public activate(): void {
        this.track.cursor = 'none';
    }

    /**
     * Called by the `ToolManager` when another tool becomes the current tool: ends the pending
     * history group.
     */
    public deactivate(): void {
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
