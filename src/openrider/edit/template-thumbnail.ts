import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '../constants/game.constants';
import { Item } from '../item/item';
import { ITEM_SPRITE_MARGIN, packItemSprites } from '../item/item-sprite';
import type { Line } from '../item/line/line';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject } from '../item/track-object';
import { SCENERY_STROKE_STYLES } from '../item/line/scenery-colors';
import { flattenLines, flattenScenery, painter } from '../render/painter';

/** Space left around the objects on each side of the thumbnail, in pixels. */
const THUMBNAIL_PADDING = 20;
/** Largest zoom of a thumbnail: a few objects are not drawn larger than the editor zooms. */
const THUMBNAIL_MAX_ZOOM = 4;

/**
 * Thumbnail of the objects of a template, as base64 PNG data without its `data:` prefix: the
 * area of the objects, scaled to fit the size of the track thumbnails within a padding and
 * centered, drawn as the render cells draw them (see `Painter.drawCell`), on a transparent
 * background. The items drawn on every frame, e.g. the command blocks, are left out.
 *
 * @returns Null without any object to draw.
 */
export function templateThumbnail(objects: readonly TrackObject[]): string | null {
    // The items of a linked group are drawn one by one
    const parts = objects.flatMap((object) =>
        object instanceof LinkedItemGroup ? object.instances : [object],
    );
    const items = parts.filter((part): part is Item => part instanceof Item);
    const lines = parts.filter((part) => part.kind !== 'item') as Line[];
    if (!parts.length) {
        return null;
    }

    // Area of the objects, the item sprites reaching around their position
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const part of parts) {
        const margin = part instanceof Item ? ITEM_SPRITE_MARGIN : 0;
        for (const { x, y } of [part.pos, part.endPos]) {
            left = Math.min(left, x - margin);
            top = Math.min(top, y - margin);
            right = Math.max(right, x + margin);
            bottom = Math.max(bottom, y + margin);
        }
    }
    const zoom = Math.min(
        (THUMBNAIL_WIDTH - 2 * THUMBNAIL_PADDING) / Math.max(right - left, 1),
        (THUMBNAIL_HEIGHT - 2 * THUMBNAIL_PADDING) / Math.max(bottom - top, 1),
        THUMBNAIL_MAX_ZOOM,
    );

    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Cannot retrieve thumbnail context');
    }
    const { buffer, colors } = packItemSprites(items);
    painter.drawCell(context, {
        zoom,
        opacityFactor: 1,
        // The center of the area at the center of the thumbnail
        offsetLeft: ((left + right) / 2) * zoom - THUMBNAIL_WIDTH / 2,
        offsetTop: ((top + bottom) / 2) * zoom - THUMBNAIL_HEIGHT / 2,
        scenery: flattenScenery(lines.filter((line) => line.kind === 'scenery')),
        sceneryColors: SCENERY_STROKE_STYLES,
        lines: flattenLines(lines.filter((line) => line.kind === 'solid')),
        sprites: new Float64Array(buffer),
        spriteColors: colors,
    });
    return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
}
