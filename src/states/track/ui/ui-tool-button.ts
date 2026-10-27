import { UIButton, UIElementFactory } from 'canvade';
import type { Tool } from '../../../openrider/tool/tool';
import { TouchControls } from '../../../openrider/touch/touch-controls';
import { ToolIcons } from './tool-icons';
import {
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_TOGGLED_BACKGROUND_COLOR,
    uiMetrics,
} from './ui-theme';

/** Type of the {@link UIToolButton} elements in the UI structures and styles. */
export const TOOL_ELEMENT_TYPE = 'tool';

/** Time a finger holds a button to show its tooltip rather than run its tool, in milliseconds. */
export const LONG_PRESS_DURATION = 500;

/**
 * Toolbar button of a tool, given in the `tool` data of the element. Its icon and colors
 * follow the tool state: selected tool, enabled toggle, paused track...
 *
 * On touch screens, holding the button shows the tooltip of its tool (see `ToolTooltip`), its
 * release then not running the tool.
 *
 * Registered in the canvade {@link UIElementFactory} under {@link TOOL_ELEMENT_TYPE} when this
 * module is imported.
 */
export class UIToolButton extends UIButton {
    /** Whether the last press was held long on a touch screen, until the next press. */
    public heldLong = false;
    /** Time the button was pressed at, `null` while it is not pressed. */
    private pressedAt: number | null = null;

    /** Tool of the button, `null` when the element has no `tool` data. */
    public get tool(): Tool | null {
        return (this.data['tool'] as Tool | undefined) ?? null;
    }

    public override press(): void {
        super.press();
        if (this.pressedAt === null) {
            this.pressedAt = performance.now();
            this.heldLong = false;
        }
    }

    public override release(): void {
        // Measured before a click, which follows the release
        this.heldLong = this.isHeldLong();
        super.release();
        if (!this.isPressed()) {
            this.pressedAt = null;
        }
    }

    /** Whether a finger holds the button long enough to show the tooltip of its tool. */
    public isHeldLong(): boolean {
        return (
            TouchControls.enabled &&
            this.pressedAt !== null &&
            performance.now() - this.pressedAt >= LONG_PRESS_DURATION
        );
    }

    protected override renderElement(ctx: CanvasRenderingContext2D): void {
        const tool = this.tool;
        const { x, y, width, height } = this.getBounds();

        // The hover and active colors of the button take precedence over the tool state colors
        let backgroundColor = this.v('backgroundColor');
        if (tool?.isActive()) {
            backgroundColor = UI_SELECTED_BACKGROUND_COLOR;
        } else if (tool?.isToggled()) {
            backgroundColor = UI_TOGGLED_BACKGROUND_COLOR;
        }

        if (this.isHovered()) {
            backgroundColor = this.isActive()
                ? this.v('activeBackgroundColor', 'backgroundColor')
                : this.v('hoverBackgroundColor', 'backgroundColor');
        }

        ctx.save();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(x, y, width, height);

        const icon = tool?.getIcon();
        if (icon) {
            const { iconSize } = uiMetrics();
            // Centered, on whole pixels so that the pixel art icons stay crisp
            const iconX = x + Math.floor((width - iconSize) / 2);
            const iconY = y + Math.floor((height - iconSize) / 2);
            ctx.drawImage(ToolIcons.get(icon, iconSize), iconX, iconY, iconSize, iconSize);
        }

        ctx.strokeStyle = UI_BORDER_COLOR;
        ctx.lineWidth = UI_BORDER_WIDTH;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
    }
}

UIElementFactory.registerElement(TOOL_ELEMENT_TYPE, UIToolButton);
