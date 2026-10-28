import type { Item } from './item';

/**
 * Shape of an item drawn in the cached images of the render cells: a circle, a square, or an
 * arrow turned by the rotation of the item.
 */
export type ItemShape = 'circle' | 'square' | 'arrow';

/** Code of each shape in the sprite buffers, read by {@link drawItemSprites}. */
const SHAPE_CODES: Record<ItemShape, number> = { circle: 0, square: 1, arrow: 2 };

/**
 * Distance an item sprite reaches around the item position, in world units: the corners of the
 * arrow and the half of its outline. The render grids store each sprite in every cell within it,
 * so that the cells do not cut the sprites at their edges.
 */
export const ITEM_SPRITE_MARGIN = 14;

/** Items of a render cell, flattened for {@link drawItemSprites}. */
export interface ItemSprites {
    /** `Float64Array` buffer of the items: shape code, color index, x, y, rotation in radians. */
    buffer: ArrayBuffer;
    /** Fill colors, by the color index of the items. */
    colors: string[];
}

/**
 * Flattens the items drawn as sprites, the others being left out.
 *
 * Items stacked on the same spot with the same look are kept once, the last one: drawing it again
 * at the same place covers the copies under it, and what was drawn between them, so it only
 * costs time. A track stacking thousands of items on a few spots then draws a few of them.
 *
 * @param current - Whether the items are drawn in their colors of the moment, e.g. reached (see
 * `Item.spriteColor`), rather than in the color of their kind, as in the cached cell images.
 */
export function packItemSprites(items: Iterable<Item>, current = false): ItemSprites {
    const colors: string[] = [];
    const looks: Array<[number, number, number, number, number]> = [];
    const seen = new Set<string>();
    // From the last item, keeping the last copy of each look and spot
    for (const item of [...items].reverse()) {
        const shape = item.sprite;
        if (shape === null) {
            continue;
        }
        const color = current ? item.spriteColor : item.itemClass.color;
        const rotation = shape === 'arrow' ? item.spriteRotation : 0;
        const key = `${shape} ${color} ${item.pos.x} ${item.pos.y} ${rotation}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        let colorIndex = colors.indexOf(color);
        if (colorIndex < 0) {
            colorIndex = colors.push(color) - 1;
        }
        looks.push([SHAPE_CODES[shape], colorIndex, item.pos.x, item.pos.y, rotation]);
    }
    return { buffer: new Float64Array(looks.reverse().flat()).buffer, colors };
}

/**
 * Pre-rendered images of the item looks, by shape, color, rotation and zoom, reused by the
 * successive calls of {@link drawItemSprites} drawing on the track.
 */
export type ItemStamps = Map<string, CanvasImageSource>;

/**
 * Draws item sprites, as the items draw themselves on the track: filled with their color,
 * outlined in black. Used for the images of the render cells, and for the reached items on each
 * frame.
 *
 * Each look (shape, color and rotation) is drawn once in a small image, a stamp, then the image
 * is copied for each item in their order: copying an image costs a fraction of filling and
 * stroking a path. Without `OffscreenCanvas`, e.g. in the tests, the items are traced one by one.
 *
 * It is also run by the render workers, serialized with `toString()`: it must stay
 * self-contained, without imports nor outer references.
 *
 * @param sprites - Items flattened by {@link packItemSprites}, in world units.
 * @param offsetLeft - Left of the image drawn on, in canvas pixels at the given zoom.
 * @param offsetTop - Top of the image drawn on, in canvas pixels at the given zoom.
 * @param stamps - Stamps kept from a call to the next, made for this call only when omitted.
 */
export function drawItemSprites(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    sprites: Float64Array,
    colors: string[],
    zoom: number,
    offsetLeft: number,
    offsetTop: number,
    stamps: Map<string, CanvasImageSource> = new Map(),
): void {
    const lineWidth = Math.max(2 * zoom, 0.5);

    /** Traces the look of an item around a point, the arrow pointing down turned by `rotation`. */
    const trace = (
        target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        shape: number,
        x: number,
        y: number,
        rotation: number,
    ) => {
        target.beginPath();
        if (shape === 0) {
            target.moveTo(x + 7 * zoom, y);
            target.arc(x, y, 7 * zoom, 0, 2 * Math.PI, true);
        } else if (shape === 1) {
            target.rect(x - 7 * zoom, y - 7 * zoom, 14 * zoom, 14 * zoom);
        } else {
            const cos = Math.cos(rotation) * zoom;
            const sin = Math.sin(rotation) * zoom;
            target.moveTo(x - 7 * cos + 10 * sin, y - 7 * sin - 10 * cos);
            target.lineTo(x - 10 * sin, y + 10 * cos);
            target.lineTo(x + 7 * cos + 10 * sin, y + 7 * sin - 10 * cos);
            target.lineTo(x - 7 * cos + 10 * sin, y - 7 * sin - 10 * cos);
        }
    };

    /** Sets the styles of the items on a context, as they draw themselves. */
    const style = (target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
        target.lineWidth = lineWidth;
        target.strokeStyle = '#000';
        // Unlike the round caps of the lines
        target.lineCap = 'butt';
        target.lineJoin = 'miter';
    };

    // Half the size of a stamp: the corners of the arrow, the outline and a pixel of margin
    const half = Math.ceil(12.3 * zoom + lineWidth) + 1;
    const stamp = (shape: number, color: string, rotation: number) => {
        const key = `${shape} ${color} ${rotation} ${zoom}`;
        let image = stamps.get(key);
        if (!image) {
            const canvas = new OffscreenCanvas(2 * half, 2 * half);
            const context = canvas.getContext('2d');
            if (context) {
                style(context);
                context.fillStyle = color;
                trace(context, shape, half, half, rotation);
                context.fill();
                context.stroke();
            }
            image = canvas;
            stamps.set(key, image);
        }
        return image;
    };

    style(ctx);
    const stamped = typeof OffscreenCanvas !== 'undefined';
    for (let i = 0; i + 4 < sprites.length; i += 5) {
        const x = sprites[i + 2] * zoom - offsetLeft;
        const y = sprites[i + 3] * zoom - offsetTop;
        const color = colors[sprites[i + 1]];
        if (stamped) {
            ctx.drawImage(stamp(sprites[i], color, sprites[i + 4]), x - half, y - half);
        } else {
            ctx.fillStyle = color;
            trace(ctx, sprites[i], x, y, sprites[i + 4]);
            ctx.fill();
            ctx.stroke();
        }
    }
}
