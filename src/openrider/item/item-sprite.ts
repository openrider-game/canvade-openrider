import type { Item } from './item';

/**
 * Shape of an item drawn in the cached images of the render cells, see `createPainter`: a circle,
 * a square, an arrow turned by the rotation of the item, or the shape of a status effect.
 */
export type ItemShape =
    | 'circle'
    | 'square'
    | 'arrow'
    | 'diamond'
    | 'octagon'
    | 'hexagon'
    | 'shield'
    | 'star'
    | 'triangle'
    | 'trapezoid'
    | 'cross'
    | 'bowTie';

/** Code of each shape in the sprite buffers, its index in the shapes of `createPainter`. */
const SHAPE_CODES: Record<ItemShape, number> = {
    circle: 0,
    square: 1,
    arrow: 2,
    diamond: 3,
    octagon: 4,
    hexagon: 5,
    shield: 6,
    star: 7,
    triangle: 8,
    trapezoid: 9,
    cross: 10,
    bowTie: 11,
};

/** Code of a shape, as the painters draw it (see `createPainter`). */
export function spriteCode(shape: ItemShape): number {
    return SHAPE_CODES[shape];
}

/**
 * Distance an item sprite reaches around the item position, in world units: the corners of the
 * arrow and the half of its outline. The render grids store each sprite in every cell within it,
 * so that the cells do not cut the sprites at their edges.
 */
export const ITEM_SPRITE_MARGIN = 14;

/** Items of a render cell, flattened for `Painter.drawSprites`. */
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
