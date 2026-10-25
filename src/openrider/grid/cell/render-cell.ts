import { RenderPriority, WorkerPool } from '../../thread/worker-pool';
import { MIN_ZOOM } from '../../track/track.constants';
import { Zoom } from '../../track/zoom';
import { Cell } from './cell';

/** Stroke colors of the scenery and solid lines in the cell images. */
export const SCENERY_STROKE_STYLE = '#aaa',
    SOLID_STROKE_STYLE = '#000',
    /** Cells with more lines than this are rendered by the workers with the fast renderer. */
    FAST_RENDER_THRESHOLD = 500;

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
 * Cell of the render cache grid, keeping a pre-rendered image of its lines for each zoom level.
 *
 * Each change of the lines increments the content version of the cell, making its images stale
 * without discarding them. With the fast renderer, dense cells are rendered by the workers in
 * the background: until the image at the current zoom is up to date, the stale image is
 * displayed, or else the image of the closest zoom level scaled to the current zoom, so that the
 * cell never blinks.
 */
export class RenderCell extends Cell {
    /** Unique id, used to deduplicate the render requests. */
    public readonly id = nextCellId++;

    /** Incremented each time the lines of the cell change. */
    private version = 0;
    private readonly images = new Map<number, CellImage>();

    /** Version of the lines of the cell, incremented each time they change. */
    public get contentVersion(): number {
        return this.version;
    }

    protected override clear(): void {
        // The stale images are kept to be displayed until they are rendered again
        this.version++;
    }

    /** Whether the cell has enough lines to be rendered by the workers with the fast renderer. */
    public isHeavy(): boolean {
        return this.lines.length + this.scenery.length > FAST_RENDER_THRESHOLD;
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
     * @param zoom - Pixel zoom, in canvas pixels per world unit.
     * @param opacityFactor - Opacity of the lines, depending on the layer.
     * @param fastRender - Whether heavy cells are rendered by the workers.
     * @param pixelRatio - Pixel ratio of the screen, to prefetch the zoom levels around the
     *   current one.
     * @returns The image, which may be stale or of another zoom, null if nothing can be displayed
     * yet.
     */
    public getImage(
        zoom: number,
        opacityFactor: number,
        fastRender: boolean,
        pixelRatio = 1,
    ): CellImage | null {
        const image = this.images.get(zoom);
        if (image?.version === this.version) {
            if (fastRender && this.isHeavy()) {
                this.prefetch(zoom, opacityFactor, pixelRatio);
            }
            return image;
        }

        if (!fastRender || !this.isHeavy()) {
            return this.renderNow(zoom, opacityFactor);
        }

        WorkerPool.request(this, zoom, opacityFactor, RenderPriority.VISIBLE);
        this.prefetch(zoom, opacityFactor, pixelRatio);

        return image ?? this.getClosestImage(zoom);
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
        }
        this.images.set(zoom, { source, zoom, version });
    }

    /** Frees the images of the cell, e.g. once the cell is discarded. */
    public releaseImages(): void {
        this.images.forEach((image) => RenderCell.release(image.source));
        this.images.clear();
    }

    private static release(source: CellImageSource): void {
        // Without bitmaps, e.g. in the tests, the images are canvases freed by the garbage collector
        if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
            source.close();
        }
    }

    /** Renders the cell lines synchronously, on the main thread. */
    private renderNow(zoom: number, opacityFactor: number): CellImage {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Cannot retrieve render cell context');
        }

        // Cells bleed by 1px on each side to avoid thin seams between adjacent cells
        canvas.width = this.size * zoom + 2;
        canvas.height = this.size * zoom + 2;

        context.lineCap = 'round';
        context.lineWidth = Math.max(2 * zoom, 0.5);
        context.globalAlpha = opacityFactor;

        context.strokeStyle = SCENERY_STROKE_STYLE;
        for (const scenery of this.scenery) {
            scenery.renderCache(context, this.x * zoom - 1, this.y * zoom - 1, zoom);
        }

        context.strokeStyle = SOLID_STROKE_STYLE;
        for (const line of this.lines) {
            line.renderCache(context, this.x * zoom - 1, this.y * zoom - 1, zoom);
        }

        this.storeImage(zoom, this.version, canvas);

        return { source: canvas, zoom, version: this.version };
    }
}
