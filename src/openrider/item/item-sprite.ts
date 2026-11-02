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

/** Numbers of a sprite in the buffers: shape code, color index, x, y, rotation. */
const SPRITE_FIELDS = 5;

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
export function packItemSprites(items: readonly Item[], current = false): ItemSprites {
    const colors: string[] = [];
    // Filled from its end, as the items are read from the last one, then cut to the looks kept
    const looks = new Float64Array(items.length * SPRITE_FIELDS);
    let start = looks.length;
    // Looks kept by spot (see spotKey): the index of the first one, or of each on a crowded spot
    const spots = new Map<number | string, number | number[]>();
    // The same look, the rotations compared as their texts were: -0 as 0, and NaN as itself
    const same = (index: number, shape: number, colorIndex: number, rotation: number) =>
        looks[index] === shape &&
        looks[index + 1] === colorIndex &&
        (looks[index + 4] === rotation ||
            (rotation !== rotation && looks[index + 4] !== looks[index + 4]));

    // From the last item, keeping the last copy of each look and spot
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const sprite = item.sprite;
        if (sprite === null) {
            continue;
        }
        const color = current ? item.spriteColor : item.itemClass.color;
        const rotation = sprite === 'arrow' ? item.spriteRotation : 0;
        const shape = SHAPE_CODES[sprite];
        let colorIndex = colors.indexOf(color);
        if (colorIndex < 0) {
            colorIndex = colors.push(color) - 1;
        }

        const { x, y } = item.pos;
        const key = spotKey(x, y);
        const kept = spots.get(key);
        if (
            typeof kept === 'number'
                ? same(kept, shape, colorIndex, rotation)
                : kept?.some((index) => same(index, shape, colorIndex, rotation))
        ) {
            continue;
        }
        start -= SPRITE_FIELDS;
        looks[start] = shape;
        looks[start + 1] = colorIndex;
        looks[start + 2] = x;
        looks[start + 3] = y;
        looks[start + 4] = rotation;
        if (kept === undefined) {
            spots.set(key, start);
        } else if (typeof kept === 'number') {
            spots.set(key, [kept, start]);
        } else {
            kept.push(start);
        }
    }
    return { buffer: looks.slice(start).buffer, colors };
}

/**
 * Key of a spot of the items: both coordinates packed into a number when they are integers of a
 * few millions, as on the tracks, or `x,y` for the others, so that two spots never share a key.
 */
function spotKey(x: number, y: number): number | string {
    const SPAN = 2 ** 24;
    if (Number.isInteger(x) && Number.isInteger(y) && Math.abs(x) < SPAN && Math.abs(y) < SPAN) {
        return (x + SPAN) * 2 * SPAN + (y + SPAN);
    }
    return `${x},${y}`;
}
