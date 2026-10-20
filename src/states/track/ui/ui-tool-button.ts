import { UIButton, UIElementFactory } from 'canvade';
import type { Tool } from '../../../openrider/tool/tool';
import { ICON_SIZE, ToolIcons } from './tool-icons';
import {
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_TOGGLED_BACKGROUND_COLOR,
} from './ui-theme';

/** Type of the {@link UIToolButton} elements in the UI structures and styles. */
export const TOOL_ELEMENT_TYPE = 'tool';

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
            ctx.drawImage(ToolIcons.get(icon), x, y, ICON_SIZE, ICON_SIZE);
        }

        ctx.strokeStyle = UI_BORDER_COLOR;
        ctx.lineWidth = UI_BORDER_WIDTH;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
    }
}

UIElementFactory.registerElement(TOOL_ELEMENT_TYPE, UIToolButton);
