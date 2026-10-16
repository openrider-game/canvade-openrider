import { Display } from 'canvade';
import type { ToolIcon } from '../../../openrider/tool/tool';

/** Size of the tool icons, in UI pixels. */
export const ICON_SIZE = 24;

/**
 * Loads the tool icons once per UI scale, drawn on canvases so that they can be rendered
 * synchronously. The canvases are sized in canvas pixels, so that the icons stay sharp on high
 * density screens: draw them {@link ICON_SIZE} UI pixels wide.
 */
export abstract class ToolIcons {
    private static readonly icons = new Map<string, HTMLCanvasElement>();

    /**
     * Returns the canvas of the icon, loading it on the first call.
     *
     * @param icon - Name of an svg icon of `media/icon`, or an inline image.
     * @returns A canvas that stays blank until the image is loaded.
     */
    public static get(icon: ToolIcon): HTMLCanvasElement {
        const scale = Display.uiScale;
        const key = `${scale}:${typeof icon === 'string' ? icon : icon.data}`;
        let canvas = ToolIcons.icons.get(key);

        if (!canvas) {
            canvas = ToolIcons.load(icon, scale);
            ToolIcons.icons.set(key, canvas);
        }

        return canvas;
    }

    private static load(icon: ToolIcon, scale: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(ICON_SIZE * scale);
        canvas.height = Math.round(ICON_SIZE * scale);

        const image = new Image();
        image.addEventListener('load', () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }
            // Inline images are smaller pixel art icons, kept crisp when scaled up
            const padding = typeof icon === 'string' ? 1 : 6;
            ctx.imageSmoothingEnabled = typeof icon === 'string';
            ctx.drawImage(
                image,
                padding * scale,
                padding * scale,
                image.width * scale,
                image.height * scale,
            );
        });
        image.src = typeof icon === 'string' ? `media/icon/${icon}.svg` : icon.data;

        return canvas;
    }
}
