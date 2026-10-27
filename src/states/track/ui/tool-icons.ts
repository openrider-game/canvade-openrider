import { Display } from 'canvade';
import { GameConfig } from '../../../openrider/config/game-config';
import type { ToolIcon } from '../../../openrider/tool/tool';

/** Size the tool icons are designed at, in UI pixels. */
const ICON_SIZE = 24;

/**
 * Loads the tool icons once per UI scale and size, drawn on canvases so that they can be rendered
 * synchronously. The canvases are sized in canvas pixels, so that the icons stay sharp on high
 * density screens: draw them as many UI pixels wide as the size they were loaded for.
 */
export abstract class ToolIcons {
    private static readonly icons = new Map<string, HTMLCanvasElement>();

    /**
     * Returns the canvas of the icon, loading it on the first call.
     *
     * @param icon - Name of an svg icon of `media/icon`, or an inline image.
     * @param size - Size of the icon, in UI pixels.
     * @param color - Color the icon is painted with, its own colors (black) by default.
     * @returns A canvas that stays blank until the image is loaded.
     */
    public static get(icon: ToolIcon, size = ICON_SIZE, color?: string): HTMLCanvasElement {
        // Canvas pixels per pixel of the icon as designed
        const scale = (Display.uiScale * size) / ICON_SIZE;
        const key = `${scale}:${color ?? ''}:${typeof icon === 'string' ? icon : icon.data}`;
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

        const image = new Image();
        image.addEventListener('load', () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
            if (typeof icon === 'string') {
                // Svg icons, smooth at any scale, filling the canvas: it is centered in the button
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            } else {
                // Inline images are smaller pixel art icons, kept crisp when scaled up: each pixel
                // covers a whole number of canvas pixels, the icon being centered
                const pixel = Math.max(1, Math.round(scale));
                const width = image.width * pixel;
                const height = image.height * pixel;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(
                    image,
                    Math.round((canvas.width - width) / 2),
                    Math.round((canvas.height - height) / 2),
                    width,
                    height,
                );
            }
            if (color) {
                // Paints the drawn pixels only
                ctx.globalCompositeOperation = 'source-in';
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        });
        image.src = typeof icon === 'string' ? GameConfig.url(`media/icon/${icon}.svg`) : icon.data;

        return canvas;
    }
}
