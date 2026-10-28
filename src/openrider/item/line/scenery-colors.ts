/**
 * Colors of the scenery lines, by index (see `Line.color`), with their names shown in the
 * options of the drawing tools: the grey of the original scenery first, and no black, kept for
 * the solid lines. The indexes are stored in the track files: a color can be changed, but not
 * moved, and new colors go at the end.
 */
export const SCENERY_COLORS: ReadonlyArray<{ name: string; color: string }> = [
    { name: 'Grey', color: '#aaa' },
    { name: 'Rose', color: '#f2a5a5' },
    { name: 'Peach', color: '#f6c49b' },
    { name: 'Butter', color: '#f3dc8a' },
    { name: 'Lime', color: '#c4e29a' },
    { name: 'Mint', color: '#9fd8b5' },
    { name: 'Sky', color: '#9fd3e3' },
    { name: 'Blue', color: '#a5bff0' },
    { name: 'Lavender', color: '#c3b1e1' },
    { name: 'Pink', color: '#f0b2d0' },
    { name: 'Sand', color: '#d8bf9c' },
    { name: 'Sage', color: '#93b89a' },
    { name: 'Steel', color: '#80a7c8' },
    { name: 'Violet', color: '#a991cf' },
    { name: 'Clay', color: '#d99a7a' },
    { name: 'Slate', color: '#7d8a91' },
];

/** Stroke colors of the scenery lines by color index, as the painters get them. */
export const SCENERY_STROKE_STYLES: readonly string[] = SCENERY_COLORS.map((entry) => entry.color);

/** Stroke color of a scenery color index, the grey for an index without a color. */
export function sceneryColor(index: number): string {
    return (SCENERY_COLORS[index] ?? SCENERY_COLORS[0]).color;
}
