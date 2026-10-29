import type { Item } from '../../item/item';
import { type ItemSprites, packItemSprites } from '../../item/item-sprite';
import type { Line } from '../../item/line/line';
import type { TrackObject } from '../../item/track-object';
import { type CellDrawing, painter } from '../../render/painter';
import { RenderPriority, WorkerPool } from '../../thread/worker-pool';
import { MIN_ZOOM } from '../../track/track.constants';
import type { Track } from '../../track/track';
import { Zoom } from '../../track/zoom';
import { Cell } from './cell';

/** Stroke colors of the scenery and solid lines in the cell images, as `createPainter` draws them. */
export const SCENERY_STROKE_STYLE = '#aaa',
    SOLID_STROKE_STYLE = '#000',
    /**
     * Cells with more lines and item sprites than this are rendered by the workers with the fast
     * renderer.
     */
    FAST_RENDER_THRESHOLD = 500,
    /**
     * Images kept by a cell, the least recently displayed ones being dropped past it, but the
     * one of the lowest zoom, a fallback always at hand.
     */
    MAX_CELL_IMAGES = 6,
    /**
     * Edits of a cell kept to patch its stale images: past it, e.g. a large selection erased, the
     * stale image is displayed as it is until rendered again.
     */
    MAX_PATCHED_EDITS = 500;

/** How a cell gets its image at a zoom, see {@link RenderCell.getImage}. */
export interface ImageOptions {
    /** Opacity of the lines, depending on the layer. */
    opacityFactor: number;
    /** Whether heavy cells are rendered by the workers. */
    fastRender: boolean;
    /** Pixel ratio of the screen, to prefetch the zoom levels around the current one. */
    pixelRatio?: number;
    /**
     * Whether the zoom settled (see `Track.zoomSettled`): while it changes, the closest image is
     * scaled rather than rendered at each zoom.
     */
    settled?: boolean;
    /** Pixel zoom the view eases to, e.g. asked by a command block, null without. */
    targetZoom?: number | null;
}

/** Object added to or removed from a cell, see {@link RenderCell.patched}. */
interface CellEdit {
    /** Content version of the cell once edited. */
    version: number;
    object: TrackObject;
    added: boolean;
}

/** Copy of a stale image of a cell, with the edits made since drawn on it. */
interface PatchedImage {
    source: HTMLCanvasElement;
    /** Version of the stale image copied. */
    base: number;
    /** Version of the last edit drawn on the copy. */
    upTo: number;
}

/** Image of a cell: a canvas when rendered synchronously, a bitmap when rendered by a worker. */
export type CellImageSource = HTMLCanvasElement | ImageBitmap;

/** Rendered lines of a cell at a zoom level, for a version of the cell content. */
export interface CellImage {
    /** Image of the cell, bleeding by 1px on each side. */
    source: CellImageSource;
    /** Zoom factor the image was rendered at, it must be scaled when drawn at another zoom. */
    zoom: number;
    /** Content version of the cell the image was rendered from. */
    version: number;
}

let nextCellId = 0;

/**
 * Cell of the render cache grid, keeping a pre-rendered image of its lines and item sprites for
 * each zoom level: the scenery lines, then the solid lines, then the sprites over them.
 *
 * A sprite near the edge of the cell is also stored in the cells it reaches, each drawing its
 * part (see `Grid`); the items without a sprite are drawn on every frame (see
 * {@link RenderCell.liveObjects}).
 *
 * Each change of the lines increments the content version of the cell, making its images stale
 * without discarding them. With the fast renderer, dense cells are rendered by the workers in
 * the background: until the image at the current zoom is up to date, the stale image is
 * displayed, or else the image of the closest zoom level scaled to the current zoom, so that the
 * cell never blinks. While the zoom changes, the closest image is scaled, the cell being rendered
 * at the zoom once it settles, and a cell keeps a few images only (see {@link MAX_CELL_IMAGES}).
 *
 * So that the edits show at once, e.g. a stroke of the brush in a dense cell, the stale image at
 * the current zoom is displayed patched with the edits made since (see
 * {@link RenderCell.patched}) until the workers render it again.
 */
export class RenderCell extends Cell {
    /** Unique id, used to deduplicate the render requests. */
    public readonly id = nextCellId++;

    /** Incremented each time the lines of the cell change. */
    private version = 0;
    private readonly images = new Map<number, CellImage>();
    /** Items drawn on every frame, listed again once the content changes. */
    private live: Item[] | null = null;
    /** Number of items drawn as sprites, counted again once the content changes. */
    private spriteCount: number | null = null;
    /** Edits since the content version {@link RenderCell.editsFrom}, in their order. */
    private edits: CellEdit[] = [];
    /** Version from which the edits are all kept: older images cannot be patched. */
    private editsFrom = 0;
    /** Patched copies of the stale images, by zoom. */
    private readonly patches = new Map<number, PatchedImage>();
    /** Sprites of the cell flattened, once for every zoom level, again once the content changes. */
    private packed: ItemSprites | null = null;
    /** Scenery and solid lines of the cell flattened, as the sprites. */
    private packedLines: { scenery: Int32Array; lines: Int32Array } | null = null;

    /** Version of the lines of the cell, incremented each time they change. */
    public get contentVersion(): number {
        return this.version;
    }

    protected override clear(): void {
        // The stale images are kept to be displayed until they are rendered again
        this.version++;
        this.live = null;
        this.spriteCount = null;
        this.packed = null;
        this.packedLines = null;
    }

    public override push(obj: TrackObject): void {
        super.push(obj);
        this.recordEdit(obj, true);
    }

    public override remove(obj: TrackObject): void {
        super.remove(obj);
        this.recordEdit(obj, false);
    }

    /**
     * Keeps an edit to patch the stale images with, once the cell has images: not while the track
     * is parsed, nor past {@link MAX_PATCHED_EDITS}.
     */
    private recordEdit(object: TrackObject, added: boolean): void {
        if (this.images.size === 0 || this.edits.length >= MAX_PATCHED_EDITS) {
            this.edits = [];
            this.editsFrom = this.version;
            return;
        }
        this.edits.push({ version: this.version, object, added });
    }

    /**
     * The stale image at its zoom with the edits made since drawn on a copy of it: the objects
     * added drawn as on the final image, the objects removed cut out of it, along with what they
     * covered in the cell, e.g. the lines they crossed, until the image is rendered again. The
     * stale image as it is when the edits since are not all kept.
     */
    private patched(image: CellImage, opacityFactor: number): CellImage {
        if (image.version < this.editsFrom || typeof document === 'undefined') {
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
        const pending = this.edits.filter((edit) => edit.version > patch.upTo);
        if (context && pending.length) {
            // The successive additions, then removals, drawn together in their order
            let run: CellEdit[] = [];
            for (const edit of pending) {
                if (run.length && run[0].added !== edit.added) {
                    this.drawEdits(context, run, image.zoom, opacityFactor);
                    run = [];
                }
                run.push(edit);
            }
            this.drawEdits(context, run, image.zoom, opacityFactor);
        }
        patch.upTo = this.version;
        return { source: patch.source, zoom: image.zoom, version: image.version };
    }

    /** Draws objects added on a patched image, or cuts out objects removed. */
    private drawEdits(
        ctx: CanvasRenderingContext2D,
        edits: CellEdit[],
        zoom: number,
        opacityFactor: number,
    ): void {
        const objects = edits.map((edit) => edit.object);
        const ofKind = <T extends TrackObject>(kind: TrackObject['kind']) =>
            objects.filter((object): object is T => object.kind === kind);
        const { buffer, colors } = packItemSprites(ofKind<Item>('item'));
        const drawing: CellDrawing = {
            zoom,
            opacityFactor,
            offsetLeft: this.x * zoom - 1,
            offsetTop: this.y * zoom - 1,
            scenery: RenderCell.flatten(ofKind<Line>('scenery')),
            lines: RenderCell.flatten(ofKind<Line>('solid')),
            sprites: new Float64Array(buffer),
            spriteColors: colors,
        };

        ctx.save();
        if (edits[0].added) {
            painter.drawCell(ctx, drawing);
        } else {
            // Cut out entirely, a pixel wider to leave no faint edge
            ctx.globalCompositeOperation = 'destination-out';
            painter.drawCell(ctx, { ...drawing, opacityFactor: 1 });
            ctx.lineWidth = Math.max(2 * zoom, 0.5) + 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000';
            for (const lines of [drawing.scenery, drawing.lines]) {
                for (let i = 0; i + 3 < lines.length; i += 4) {
                    ctx.beginPath();
                    ctx.moveTo(
                        lines[i] * zoom - drawing.offsetLeft,
                        lines[i + 1] * zoom - drawing.offsetTop,
                    );
                    ctx.lineTo(
                        lines[i + 2] * zoom - drawing.offsetLeft,
                        lines[i + 3] * zoom - drawing.offsetTop,
                    );
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    /** Sprites of the cell, flattened by `packItemSprites`: not to be changed, but copied. */
    public get packedSprites(): ItemSprites {
        this.packed ??= packItemSprites(this.objects);
        return this.packed;
    }

    /**
     * What the painters draw for the cell at a zoom (see `createPainter`): its lines and sprites
     * flattened once per content, shared by every zoom level, not to be changed.
     *
     * @param opacityFactor - Opacity of the lines, depending on the layer.
     */
    public drawing(zoom: number, opacityFactor: number): CellDrawing {
        this.packedLines ??= {
            scenery: RenderCell.flatten(this.scenery),
            lines: RenderCell.flatten(this.lines),
        };
        const { buffer, colors } = this.packedSprites;
        return {
            zoom,
            opacityFactor,
            // Cells bleed by 1px on each side to avoid thin seams between adjacent cells
            offsetLeft: this.x * zoom - 1,
            offsetTop: this.y * zoom - 1,
            scenery: this.packedLines.scenery,
            lines: this.packedLines.lines,
            sprites: new Float64Array(buffer),
            spriteColors: colors,
        };
    }

    /** Lines flattened as `[x1, y1, x2, y2, ...]`, in world units. */
    private static flatten(lines: readonly Line[]): Int32Array {
        return new Int32Array(
            lines.flatMap((line) => [line.pos.x, line.pos.y, line.endPos.x, line.endPos.y]),
        );
    }

    /** Items of the cell without a sprite, drawn on every frame, e.g. the command blocks. */
    public get liveObjects(): readonly Item[] {
        this.live ??= this.objects.filter((item) => item.sprite === null);
        return this.live;
    }

    /** Number of items drawn in the images of the cell. */
    public get sprites(): number {
        this.spriteCount ??= this.objects.length - this.liveObjects.length;
        return this.spriteCount;
    }

    /**
     * Whether the cell has enough lines and sprites to be rendered by the workers with the fast
     * renderer.
     */
    public isHeavy(): boolean {
        return this.lines.length + this.scenery.length + this.sprites > FAST_RENDER_THRESHOLD;
    }

    /**
     * State of the image displayed at a zoom level: `current` when it matches the content of the
     * cell, `stale` when the content changed since, `other-zoom` when only images of other zoom
     * levels can be scaled to it, `none` when there is nothing to display.
     */
    public imageState(zoom: number): 'current' | 'stale' | 'other-zoom' | 'none' {
        const image = this.images.get(zoom);
        if (image) {
            return image.version === this.version ? 'current' : 'stale';
        }
        return this.images.size ? 'other-zoom' : 'none';
    }

    /** Whether the image at the given zoom matches the current content of the cell. */
    public isUpToDate(zoom: number): boolean {
        return this.images.get(zoom)?.version === this.version;
    }

    /**
     * Gets the best image to display at a zoom level, rendering it if needed.
     *
     * Light cells, or every cell without the fast renderer, are rendered synchronously. Heavy cells
     * are requested to the workers with the {@link RenderPriority.VISIBLE} priority, and a stale
     * or another zoom image is returned meanwhile.
     *
     * While the zoom changes, the closest image is returned as it is, to be scaled: the cell is
     * only rendered without any image, and the heavy cells at the zoom eased to, if any.
     *
     * @param zoom - Pixel zoom, in canvas pixels per world unit.
     * @returns The image, which may be stale or of another zoom, null if nothing can be displayed
     * yet.
     */
    public getImage(zoom: number, options: ImageOptions): CellImage | null {
        const { opacityFactor, fastRender, pixelRatio = 1, settled = true } = options;
        const heavy = fastRender && this.isHeavy();
        const image = this.images.get(zoom);
        if (image?.version === this.version) {
            if (heavy && settled) {
                this.prefetch(zoom, opacityFactor, pixelRatio);
            }
            return this.used(image);
        }

        if (!settled) {
            const target = options.targetZoom;
            if (heavy && target && !this.isUpToDate(target)) {
                WorkerPool.request(this, target, opacityFactor, RenderPriority.ADJACENT);
            }
            const closest = this.getClosestImage(zoom);
            if (closest) {
                return this.used(closest);
            }
        }

        if (!heavy) {
            return this.renderNow(zoom, opacityFactor);
        }

        WorkerPool.request(this, zoom, opacityFactor, RenderPriority.VISIBLE);
        if (settled) {
            this.prefetch(zoom, opacityFactor, pixelRatio);
        }

        // The stale image of the zoom, with the edits since, or another zoom as it is
        if (image) {
            return this.patched(this.used(image), opacityFactor);
        }
        const fallback = this.getClosestImage(zoom);
        return fallback && this.used(fallback);
    }

    /**
     * How the cells of a track get their images for now: scaled while its zoom changes, the heavy
     * ones requested at the zoom it eases to.
     *
     * @param opacityFactor - Opacity of the lines, depending on the layer.
     * @param fastRender - Whether heavy cells are rendered by the workers.
     */
    public static optionsFor(
        track: Track,
        opacityFactor: number,
        fastRender: boolean,
    ): ImageOptions {
        return {
            opacityFactor,
            fastRender,
            pixelRatio: track.pixelRatio,
            settled: track.zoomSettled,
            targetZoom:
                track.zoomTarget === null ? null : Zoom.toPixel(track.zoomTarget, track.pixelRatio),
        };
    }

    /** Marks an image as the most recently displayed, the last one dropped (see `storeImage`). */
    private used(image: CellImage): CellImage {
        this.images.delete(image.zoom);
        this.images.set(image.zoom, image);
        return image;
    }

    /**
     * Renders in the background the images used while zooming: a low resolution image always
     * available as a fallback, and the zoom levels around the current one, the levels being
     * stepped in view zoom.
     */
    private prefetch(zoom: number, opacityFactor: number, pixelRatio: number): void {
        const viewZoom = Zoom.toView(zoom, pixelRatio);
        const levels: Array<[number, RenderPriority]> = [
            [MIN_ZOOM, RenderPriority.FALLBACK],
            [Zoom.step(viewZoom, -1), RenderPriority.ADJACENT],
            [Zoom.step(viewZoom, 1), RenderPriority.ADJACENT],
        ];

        for (const [level, priority] of levels) {
            const pixelZoom = Zoom.toPixel(level, pixelRatio);
            if (Zoom.isValid(level) && pixelZoom !== zoom && !this.isUpToDate(pixelZoom)) {
                WorkerPool.request(this, pixelZoom, opacityFactor, priority);
            }
        }
    }

    /** Finds the image to display meanwhile: up to date images first, then the closest zoom. */
    private getClosestImage(zoom: number): CellImage | null {
        let closest: CellImage | null = null;
        let closestScore = Infinity;

        for (const image of this.images.values()) {
            const score =
                Math.abs(Math.log(image.zoom / zoom)) + (image.version === this.version ? 0 : 10);
            if (score < closestScore) {
                closest = image;
                closestScore = score;
            }
        }

        return closest;
    }

    /**
     * Keeps a rendered image, unless a more recent one is already known.
     *
     * The replaced or discarded bitmap is closed to free its memory.
     *
     * @param version - Content version of the cell the image was rendered from.
     */
    public storeImage(zoom: number, version: number, source: CellImageSource): void {
        const current = this.images.get(zoom);
        if (current && current.version > version) {
            RenderCell.release(source);
            return;
        }

        if (current) {
            RenderCell.release(current.source);
            this.images.delete(zoom);
        }
        this.images.set(zoom, { source, zoom, version });
        if (version === this.version) {
            this.patches.delete(zoom);
        }
        // Only the edits newer than every image can still patch one
        const oldest = Math.min(...[...this.images.values()].map((image) => image.version));
        if (oldest > this.editsFrom) {
            this.edits = this.edits.filter((edit) => edit.version > oldest);
            this.editsFrom = oldest;
        }

        // The least recently displayed images first, the one of the lowest zoom always kept
        const lowest = Math.min(...this.images.keys());
        for (const kept of this.images.keys()) {
            if (this.images.size <= MAX_CELL_IMAGES) {
                break;
            }
            if (kept !== lowest && kept !== zoom) {
                RenderCell.release(this.images.get(kept)!.source);
                this.images.delete(kept);
            }
        }
    }

    /** Frees the images of the cell, e.g. once the cell is discarded. */
    public releaseImages(): void {
        this.images.forEach((image) => RenderCell.release(image.source));
        this.images.clear();
        this.patches.clear();
        this.edits = [];
        this.editsFrom = this.version;
    }

    private static release(source: CellImageSource): void {
        // Without bitmaps, e.g. in the tests, the images are canvases freed by the garbage collector
        if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
            source.close();
        }
    }

    /** Renders the cell lines and sprites synchronously, on the main thread. */
    private renderNow(zoom: number, opacityFactor: number): CellImage {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Cannot retrieve render cell context');
        }

        // Cells bleed by 1px on each side to avoid thin seams between adjacent cells
        canvas.width = this.size * zoom + 2;
        canvas.height = this.size * zoom + 2;
        painter.drawCell(context, this.drawing(zoom, opacityFactor));

        this.storeImage(zoom, this.version, canvas);

        return { source: canvas, zoom, version: this.version };
    }
}
