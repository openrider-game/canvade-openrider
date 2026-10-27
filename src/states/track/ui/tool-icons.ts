import { Display } from 'canvade';
import { GameConfig } from '../../../openrider/config/game-config';
import type { ToolIcon } from '../../../openrider/tool/tool';

/** Size the tool icons are designed at, in UI pixels. */
const ICON_SIZE = 24;

/**
 * Loads the tool icons once per UI scale and size, drawn on canvases so that they can be rendered
 * synchronously. The canvases are sized in canvas pixels, so that the icons stay sharp on high
 * density screens: draw them as many UI pixels wide as the size they were loaded for.
 *
 * The svg icons are loaded from `media/icon`, the drawn icons (see `DrawnIcon`) are drawn right
 * away at the size of their canvas.
 */
export abstract class ToolIcons {
    private static readonly icons = new Map<string, HTMLCanvasElement>();

    /**
     * Returns the canvas of the icon, loading it on the first call.
     *
     * @param icon - Name of an svg icon of `media/icon`, or a drawn icon.
     * @param size - Size of the icon, in UI pixels.
     * @param color - Color the icon is painted with, its own colors by default.
     * @returns A canvas that stays blank until an svg icon is loaded.
     */
    public static get(icon: ToolIcon, size = ICON_SIZE, color?: string): HTMLCanvasElement {
        // Canvas pixels per pixel of the icon as designed
        const scale = (Display.uiScale * size) / ICON_SIZE;
        const key = `${scale}:${color ?? ''}:${typeof icon === 'string' ? icon : icon.key}`;
        let canvas = ToolIcons.icons.get(key);

        if (!canvas) {
            canvas = ToolIcons.load(icon, scale, color);
            ToolIcons.icons.set(key, canvas);
        }

        return canvas;
    }

    private static load(icon: ToolIcon, scale: number, color?: string): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(ICON_SIZE * scale);
        canvas.height = Math.round(ICON_SIZE * scale);

        if (typeof icon !== 'string') {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                icon.draw(ctx, canvas.width);
                ToolIcons.paint(ctx, color);
            }
            return canvas;
        }

        const image = new Image();
        image.addEventListener('load', () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
            // Smooth at any scale, filling the canvas: it is centered in the button
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            ToolIcons.paint(ctx, color);
        });
        image.src = GameConfig.url(`media/icon/${icon}.svg`);

        return canvas;
    }

    /** Paints the drawn pixels of an icon with a color, if any. */
    private static paint(ctx: CanvasRenderingContext2D, color: string | undefined): void {
        if (!color) {
            return;
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
}
