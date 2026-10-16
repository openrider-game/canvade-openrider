import type { ToolIcon } from '../../../openrider/tool/tool';

/** Size of the tool icons, in canvas pixels. */
export const ICON_SIZE = 24;

/** Loads the tool icons once, drawn on canvases so that they can be rendered synchronously. */
export abstract class ToolIcons {
    private static readonly icons = new Map<string, HTMLCanvasElement>();

    /**
     * Returns the canvas of the icon, loading it on the first call.
     *
     * @param icon - Name of an svg icon of `media/icon`, or an inline image.
     * @returns A canvas that stays blank until the image is loaded.
     */
    public static get(icon: ToolIcon): HTMLCanvasElement {
        const key = typeof icon === 'string' ? icon : icon.data;
        let canvas = ToolIcons.icons.get(key);

        if (!canvas) {
            canvas = ToolIcons.load(icon);
            ToolIcons.icons.set(key, canvas);
        }

        return canvas;
    }

    private static load(icon: ToolIcon): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = ICON_SIZE;
        canvas.height = ICON_SIZE;

        const image = new Image();
        image.addEventListener('load', () => {
            // Inline images are smaller than the svg icons
            const padding = typeof icon === 'string' ? 1 : 6;
            canvas.getContext('2d')?.drawImage(image, padding, padding);
        });
        image.src = typeof icon === 'string' ? `media/icon/${icon}.svg` : icon.data;

        return canvas;
    }
}
