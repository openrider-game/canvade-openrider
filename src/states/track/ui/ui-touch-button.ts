import { UIButton, UIElementFactory } from 'canvade';
import { TOUCH_ELEMENT_TYPE } from '../../../openrider/touch/touch-controls';
import { ToolIcons } from './tool-icons';
import {
    UI_BORDER_COLOR,
    UI_BORDER_WIDTH,
    UI_SELECTED_BACKGROUND_COLOR,
    UI_SELECTED_TEXT_COLOR,
} from './ui-theme';

/** Background of the buttons, slightly transparent over the track. */
const BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.85)',
    /** Size of the icon, relative to the size of the button. */
    ICON_RATIO = 0.6;

/**
 * Riding button of the touch controls (see `TouchControls`), drawing the icon given in its `icon`
 * data. It looks like a toolbar button: square, with a black border, and like the selected tool
 * while a finger presses it, with a white icon.
 *
 * Registered in the canvade {@link UIElementFactory} under {@link TOUCH_ELEMENT_TYPE} when this
 * module is imported.
 */
export class UITouchButton extends UIButton {
    protected override renderElement(ctx: CanvasRenderingContext2D): void {
        const { x, y, width, height } = this.getBounds();
        const pressed = this.isPressed() || this.isActive();

        ctx.save();
        ctx.fillStyle = pressed ? UI_SELECTED_BACKGROUND_COLOR : BACKGROUND_COLOR;
        ctx.fillRect(x, y, width, height);

        const icon = this.data['icon'] as string | undefined;
        if (icon) {
            const size = Math.round(Math.min(width, height) * ICON_RATIO);
            const color = pressed ? UI_SELECTED_TEXT_COLOR : undefined;
            ctx.drawImage(
                ToolIcons.get(icon, size, color),
                x + (width - size) / 2,
                y + (height - size) / 2,
                size,
                size,
            );
        }

        ctx.strokeStyle = UI_BORDER_COLOR;
        ctx.lineWidth = UI_BORDER_WIDTH;
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
    }
}

UIElementFactory.registerElement(TOUCH_ELEMENT_TYPE, UITouchButton);
