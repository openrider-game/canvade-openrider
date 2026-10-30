import { ITEM_SPRITE_MARGIN, packItemSprites } from '../../item/item-sprite';
import type { TrackObject } from '../../item/track-object';
import { type CellDrawing, flattenLines, painter } from '../../render/painter';
import type { CellImage, RenderCell } from './render-cell';

/**
 * Edits of a cell kept to patch its stale images, bounding their memory: past it, the patched
 * image is drawn again entirely once (see `CellPatcher.patched`).
 */
export const MAX_PATCHED_EDITS = 20_000,
    /**
     * Edits drawn on a patched image at once past which drawing it again entirely costs less, e.g.
     * a large area erased in a single step.
     */
    REDRAW_EDITS = 2_000,
    /** Length of the pieces of a line repainted apart, in world units, see `CellPatcher.repaint`. */
    REPAINT_STEP = 40;

/** Area of an image, as `[left, top, right, bottom]` in world units. */
type Box = [number, number, number, number];

/** Object added to or removed from a cell, see {@link CellPatcher.patched}. */
interface CellEdit {
    /** Content version of the cell once edited. */
    version: number;
    object: TrackObject;
}

/** Copy of a stale image of a cell, with the edits made since drawn on it. */
interface PatchedImage {
    source: HTMLCanvasElement;
    /** Version of the stale image copied. */
    base: number;
    /** Version of the last edit drawn on the copy. */
    upTo: number;
}

/**
 * Shows the edits of a {@link RenderCell} at once, e.g. a stroke of the brush in a dense cell,
 * while the workers render its images again: it keeps the objects added and removed since its
 * images, and displays a stale image patched with them (see {@link CellPatcher.patched}).
 */
export class CellPatcher {
    /** Edits since the content version {@link CellPatcher.editsFrom}, in their order. */
    private edits: CellEdit[] = [];
    /** Version from which the edits are all kept: older images cannot be patched. */
    private editsFrom = 0;
    /** Patched copies of the stale images, by zoom. */
    private readonly patches = new Map<number, PatchedImage>();

    public constructor(private readonly cell: RenderCell) {}

    /**
     * Keeps an edit of the cell, once it has images to patch: not while the track is parsed. Past
     * {@link MAX_PATCHED_EDITS}, the edits kept are forgotten, the patched images being drawn again.
     */
    public record(object: TrackObject, hasImages: boolean): void {
        const version = this.cell.contentVersion;
        if (!hasImages || this.edits.length >= MAX_PATCHED_EDITS) {
            this.edits = [];
            this.editsFrom = version;
            return;
        }
        this.edits.push({ version, object });
    }

    /**
     * Forgets what an image stored by the cell makes useless: the patch of its zoom once up to
     * date, and the edits older than every image.
     *
     * @param images - Images of the cell, the stored one included.
     */
    public stored(image: CellImage, images: Iterable<CellImage>): void {
        if (image.version === this.cell.contentVersion) {
            this.patches.delete(image.zoom);
        }
        const oldest = Math.min(...[...images].map(({ version }) => version));
        if (oldest > this.editsFrom) {
            this.edits = this.edits.filter((edit) => edit.version > oldest);
            this.editsFrom = oldest;
        }
    }

    /** Forgets the edits and the patches, once the images of the cell are freed. */
    public reset(): void {
        this.patches.clear();
        this.edits = [];
        this.editsFrom = this.cell.contentVersion;
    }

    /**
     * The stale image at its zoom with the edits made since on a copy of it, until the image is
     * rendered again: the edits of each frame are repainted on it (see {@link CellPatcher.repaint}).
     *
     * When the edits since the copy are not all kept, or too many to repaint, e.g. in a dense cell
     * erased for a while, the copy is drawn again entirely from the content of the cell, once, on
     * the main thread: it then shows every edit, the next ones being repainted again.
     */
    public patched(image: CellImage, opacityFactor: number): CellImage {
        if (typeof document === 'undefined') {
            return image;
        }
        let patch = this.patches.get(image.zoom);
        if (!patch || patch.base !== image.version) {
            const source = document.createElement('canvas');
            source.width = image.source.width;
            source.height = image.source.height;
            source.getContext('2d')?.drawImage(image.source, 0, 0);
            patch = { source, base: image.version, upTo: image.version };
            this.patches.set(image.zoom, patch);
        }

        const context = patch.source.getContext('2d');
        if (context && patch.upTo !== this.cell.contentVersion) {
            const edited =
                patch.upTo < this.editsFrom
                    ? null
                    : this.edits
                          .filter((edit) => edit.version > patch.upTo)
                          .map((edit) => edit.object);
            if (edited === null || edited.length > REDRAW_EDITS) {
                this.redraw(context, image.zoom, opacityFactor);
            } else if (edited.length) {
                this.repaint(context, edited, image.zoom, opacityFactor);
            }
        }
        patch.upTo = this.cell.contentVersion;
        return { source: patch.source, zoom: image.zoom, version: image.version };
    }

    /** Draws a patched image again entirely, as the cell is now. */
    private redraw(ctx: CanvasRenderingContext2D, zoom: number, opacityFactor: number): void {
        ctx.save();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        painter.drawCell(ctx, this.cell.drawing(zoom, opacityFactor));
        ctx.restore();
    }

    /**
     * Repaints the areas of an image where objects were added or removed: the areas are cleared,
     * then every object of the cell going through them is drawn again in them, in the order of
     * the cell images. They then look as the image rendered again will, an object removed leaving
     * what it covered, e.g. the lines it crossed.
     *
     * The areas hug the objects, a line being cut in pieces of {@link REPAINT_STEP}, so that a long
     * line across a dense cell only repaints the few objects along it.
     */
    private repaint(
        ctx: CanvasRenderingContext2D,
        edited: TrackObject[],
        zoom: number,
        opacityFactor: number,
    ): void {
        const cell = this.cell;
        // Half the width of the lines and a pixel of their smoothed edge, in world units
        const pad = (Math.max(2 * zoom, 0.5) / 2 + 1) / zoom;
        const boxes = edited.flatMap((object) => CellPatcher.pieces(object, pad));
        // Most objects of a dense cell are far from the edits: compared with the area around
        // every edit first, without creating anything, then with the areas of the edits
        let [unionLeft, unionTop, unionRight, unionBottom] = [
            Infinity,
            Infinity,
            -Infinity,
            -Infinity,
        ];
        for (const [left, top, right, bottom] of boxes) {
            unionLeft = Math.min(unionLeft, left);
            unionTop = Math.min(unionTop, top);
            unionRight = Math.max(unionRight, right);
            unionBottom = Math.max(unionBottom, bottom);
        }
        const reach = ITEM_SPRITE_MARGIN + pad;
        const crosses = (object: TrackObject) => {
            const { pos, endPos } = object;
            const item = object.kind === 'item';
            const left = item ? pos.x - reach : Math.min(pos.x, endPos.x) - pad;
            const right = item ? pos.x + reach : Math.max(pos.x, endPos.x) + pad;
            const top = item ? pos.y - reach : Math.min(pos.y, endPos.y) - pad;
            const bottom = item ? pos.y + reach : Math.max(pos.y, endPos.y) + pad;
            if (left > unionRight || right < unionLeft || top > unionBottom || bottom < unionTop) {
                return false;
            }
            return boxes.some(([l, t, r, b]) => left <= r && right >= l && top <= b && bottom >= t);
        };

        const offsetLeft = cell.x * zoom - 1;
        const offsetTop = cell.y * zoom - 1;
        const { buffer, colors } = packItemSprites(cell.objects.filter(crosses));
        const drawing: CellDrawing = {
            zoom,
            opacityFactor,
            offsetLeft,
            offsetTop,
            scenery: flattenLines(cell.scenery.filter(crosses)),
            lines: flattenLines(cell.lines.filter(crosses)),
            sprites: new Float64Array(buffer),
            spriteColors: colors,
        };

        ctx.save();
        // Whole pixels, so that the areas have sharp edges
        ctx.beginPath();
        for (const [left, top, right, bottom] of boxes) {
            const x = Math.floor(left * zoom - offsetLeft);
            const y = Math.floor(top * zoom - offsetTop);
            ctx.rect(
                x,
                y,
                Math.ceil(right * zoom - offsetLeft) - x,
                Math.ceil(bottom * zoom - offsetTop) - y,
            );
        }
        ctx.clip();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        painter.drawCell(ctx, drawing);
        ctx.restore();
    }

    /** Area an object is drawn in, widened by a padding, in world units. */
    private static bounds(object: TrackObject, pad: number): Box {
        if (object.kind === 'item') {
            const reach = ITEM_SPRITE_MARGIN + pad;
            const { x, y } = object.pos;
            return [x - reach, y - reach, x + reach, y + reach];
        }
        const { pos, endPos } = object;
        return [
            Math.min(pos.x, endPos.x) - pad,
            Math.min(pos.y, endPos.y) - pad,
            Math.max(pos.x, endPos.x) + pad,
            Math.max(pos.y, endPos.y) + pad,
        ];
    }

    /** Areas covering an object: a line in pieces of {@link REPAINT_STEP}, an item at once. */
    private static pieces(object: TrackObject, pad: number): Box[] {
        if (object.kind === 'item') {
            return [CellPatcher.bounds(object, pad)];
        }
        const { pos, endPos } = object;
        const count = Math.max(1, Math.ceil(pos.distanceTo(endPos) / REPAINT_STEP));
        const boxes: Box[] = [];
        for (let i = 0; i < count; i++) {
            const [x1, y1] = [
                pos.x + ((endPos.x - pos.x) * i) / count,
                pos.y + ((endPos.y - pos.y) * i) / count,
            ];
            const [x2, y2] = [
                pos.x + ((endPos.x - pos.x) * (i + 1)) / count,
                pos.y + ((endPos.y - pos.y) * (i + 1)) / count,
            ];
            boxes.push([
                Math.min(x1, x2) - pad,
                Math.min(y1, y2) - pad,
                Math.max(x1, x2) + pad,
                Math.max(y1, y2) + pad,
            ]);
        }
        return boxes;
    }
}
