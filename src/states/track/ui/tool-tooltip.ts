import { UIElement } from 'canvade';
import { UIToolButton } from './ui-tool-button';
import { UI_BACKGROUND_COLOR, UI_BORDER_COLOR, UI_BORDER_WIDTH } from './ui-theme';

const MARGIN = 4;

/**
 * Tooltip of the hovered tool button: the name of the tool and its shortcut, next to the button,
 * on the left of it for the buttons of the right half of the canvas.
 */
export abstract class ToolTooltip {
    /**
     * Draws the tooltip of the hovered tool button of a UI tree, if any, once the tree is drawn.
     *
     * @param root - Root of the UI tree, covering the canvas.
     */
    public static render(ctx: CanvasRenderingContext2D, root: UIElement): void {
        const hovered = ToolTooltip.findHoveredTool(root);
        const tool = hovered?.tool;
        if (!hovered || !tool) {
            return;
        }

        const { x, y, width, height } = hovered.getBounds();
        const keyLabel = tool.toolClass.keyLabel;
        const label = keyLabel ? `${tool.getLabel()} (${keyLabel})` : tool.getLabel();

        ctx.save();
        const metrics = ctx.measureText(label);
        const labelHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

        let rectX = x + width + MARGIN;
        if (x > root.getBounds().width / 2) {
            rectX = x - 2 * MARGIN - metrics.width;
        }

        ctx.fillStyle = UI_BACKGROUND_COLOR;
        ctx.strokeStyle = UI_BORDER_COLOR;
        ctx.lineWidth = UI_BORDER_WIDTH;
        ctx.beginPath();
        ctx.rect(rectX, y + 1, metrics.width + MARGIN, height - 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = UI_BORDER_COLOR;
        ctx.fillText(label, rectX + MARGIN / 2, y + labelHeight + 5);
        ctx.restore();
    }

    private static findHoveredTool(element: UIElement): UIToolButton | null {
        if (element instanceof UIToolButton && element.isHovered()) {
            return element;
        }

        for (const child of element.children) {
            const hovered = ToolTooltip.findHoveredTool(child);
            if (hovered) {
                return hovered;
            }
        }

        return null;
    }
}
