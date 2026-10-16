import { UIButton, UIElementFactory } from 'canvade';
import type { Tool } from '../../../openrider/tool/tool';
import { ICON_SIZE, ToolIcons } from './tool-icons';

/** Type of the {@link UIToolButton} elements in the UI structures and styles. */
export const TOOL_ELEMENT_TYPE = 'tool';

const SELECTED_BACKGROUND_COLOR = '#456',
    TOGGLED_BACKGROUND_COLOR = '#077',
    BORDER_COLOR = '#000';

/**
 * Toolbar button of a tool, given in the `tool` data of the element. Its icon and colors
 * follow the tool state: selected tool, enabled toggle, paused track...
 *
 * Registered in the canvade {@link UIElementFactory} under {@link TOOL_ELEMENT_TYPE} when this
 * module is imported.
 */
export class UIToolButton extends UIButton {
    /** Tool of the button, `null` when the element has no `tool` data. */
    public get tool(): Tool | null {
        return (this.data['tool'] as Tool | undefined) ?? null;
    }

    protected override renderElement(ctx: CanvasRenderingContext2D): void {
        const tool = this.tool;
        const { x, y, width, height } = this.getBounds();

        // The hover and active colors of the button take precedence over the tool state colors
        let backgroundColor = this.v('backgroundColor');
        if (tool?.isActive()) {
            backgroundColor = SELECTED_BACKGROUND_COLOR;
        } else if (tool?.isToggled()) {
            backgroundColor = TOGGLED_BACKGROUND_COLOR;
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
            ctx.drawImage(ToolIcons.get(icon), x, y, ICON_SIZE, ICON_SIZE);
        }

        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
    }
}

UIElementFactory.registerElement(TOOL_ELEMENT_TYPE, UIToolButton);
