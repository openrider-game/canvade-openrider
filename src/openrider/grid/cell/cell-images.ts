/**
 * Images kept by a cell, the least recently displayed ones being dropped past it, but the one of
 * the lowest zoom, a fallback always at hand.
 */
export const MAX_CELL_IMAGES = 6,
    /**
     * Memory of the images of every cell, in bytes, past which the images of the least recently
     * displayed cells are dropped: panning a long track at a high zoom would otherwise keep the
     * images of every cell seen, a few tens of MB each at the highest zooms.
     */
    MAX_IMAGE_BYTES = 256 * 1024 * 1024,
    /**
     * Time during which the images of a cell displayed are never dropped by the memory bound, in
     * ms: all of them, those rendered ahead for the zooms around included.
     */
    DISPLAYED_IMAGE_MS = 1000;

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

/**
 * Images of a render cell by zoom level, at most {@link MAX_CELL_IMAGES}, in the order they were
 * last displayed: the least recently displayed ones are dropped first, and their bitmaps closed
 * to free their memory.
 *
 * The images of every cell also share {@link MAX_IMAGE_BYTES}: past it, the images of the least
 * recently displayed cells are dropped, their fallbacks last.
 */
export class CellImages {
    /** Cells with images, the least recently displayed first, by their last display in ms. */
    private static readonly budget = new Map<CellImages, number>();
    /** Memory of the images of every cell, in bytes. */
    private static bytes = 0;

    private readonly images = new Map<number, CellImage>();

    /**
     * @param onDrop - Called with the zoom of each image dropped, e.g. for the cell to forget
     * what it derived from it.
     */
    public constructor(private readonly onDrop?: (zoom: number) => void) {}

    /** Memory of the images of every cell, in bytes. */
    public static get totalBytes(): number {
        return CellImages.bytes;
    }

    /** Number of images kept. */
    public get size(): number {
        return this.images.size;
    }

    /** Image of a zoom level, whatever its version. */
    public get(zoom: number): CellImage | undefined {
        return this.images.get(zoom);
    }

    /** Images kept, the least recently displayed first. */
    public values(): IterableIterator<CellImage> {
        return this.images.values();
    }

    /** Marks an image as the most recently displayed, the last one dropped (see {@link evict}). */
    public used(image: CellImage): CellImage {
        if (this.images.get(image.zoom) !== image) {
            // Dropped meanwhile, or another one of its zoom stored since
            return image;
        }
        this.images.delete(image.zoom);
        this.images.set(image.zoom, image);
        this.touch();
        return image;
    }

    /**
     * Image to display meanwhile at a zoom: of the current content version first, then of the
     * closest zoom.
     *
     * @param version - Current content version of the cell.
     */
    public closest(zoom: number, version: number): CellImage | null {
        let closest: CellImage | null = null;
        let closestScore = Infinity;

        for (const image of this.images.values()) {
            const score =
                Math.abs(Math.log(image.zoom / zoom)) + (image.version === version ? 0 : 10);
            if (score < closestScore) {
                closest = image;
                closestScore = score;
            }
        }

        return closest;
    }

    /**
     * Keeps a rendered image, unless a more recent one is already known: the replaced or
     * discarded bitmap is closed. Followed by {@link evict}, to keep only a few images.
     *
     * @param version - Content version of the cell the image was rendered from.
     * @returns The image kept, null when discarded.
     */
    public put(zoom: number, version: number, source: CellImageSource): CellImage | null {
        const current = this.images.get(zoom);
        if (current && current.version > version) {
            CellImages.release(source);
            return null;
        }

        if (current) {
            this.drop(current);
        }
        const stored = { source, zoom, version };
        this.images.set(zoom, stored);
        const bytes = CellImages.bytesOf(source);
        CellImages.bytes += bytes;
        // Just rendered: requested for the view, or ahead of it
        this.touch();
        return stored;
    }

    /**
     * Drops the least recently displayed images past {@link MAX_CELL_IMAGES}, but the one of the
     * lowest zoom, and the one just stored, then the images of every cell past
     * {@link MAX_IMAGE_BYTES} (see {@link CellImages.enforceBudget}).
     *
     * @param zoom - Zoom of the image just stored.
     */
    public evict(zoom: number): void {
        const lowest = this.lowestZoom();
        for (const kept of [...this.images.keys()]) {
            if (this.images.size <= MAX_CELL_IMAGES) {
                break;
            }
            if (kept !== lowest && kept !== zoom) {
                this.drop(this.images.get(kept)!);
            }
        }
        CellImages.enforceBudget();
    }

    /** Frees every image, e.g. once the cell is discarded. */
    public clear(): void {
        [...this.images.values()].forEach((image) => this.drop(image));
    }

    /**
     * Drops the images of the least recently displayed cells while their memory is past
     * {@link MAX_IMAGE_BYTES}: first their images other than the lowest zoom, then those
     * fallbacks. The cells displayed within {@link DISPLAYED_IMAGE_MS} keep their images, e.g.
     * the cells in view, even past the bound: dropping them would only render them again.
     *
     * @param limit - Memory kept, in bytes.
     */
    public static enforceBudget(limit = MAX_IMAGE_BYTES): void {
        if (CellImages.bytes <= limit) {
            return;
        }
        const recent = performance.now() - DISPLAYED_IMAGE_MS;
        for (const fallbacks of [false, true]) {
            // Dropping images while iterating the map is safe: the next entries are kept
            for (const [cell, usedAt] of CellImages.budget) {
                if (CellImages.bytes <= limit || usedAt > recent) {
                    // The next ones were displayed more recently
                    break;
                }
                const lowest = cell.lowestZoom();
                for (const image of [...cell.images.values()]) {
                    if (fallbacks || image.zoom !== lowest) {
                        cell.drop(image);
                    }
                }
            }
        }
    }

    /** Marks the cell as the most recently displayed, see {@link CellImages.enforceBudget}. */
    private touch(): void {
        CellImages.budget.delete(this);
        CellImages.budget.set(this, performance.now());
    }

    /** Memory of an image, in bytes: 4 per pixel. */
    private static bytesOf(source: CellImageSource): number {
        return source.width * source.height * 4;
    }

    /** Lowest zoom of the images, the fallback of the cell; Infinity without image. */
    private lowestZoom(): number {
        let lowest = Infinity;
        for (const zoom of this.images.keys()) {
            lowest = Math.min(lowest, zoom);
        }
        return lowest;
    }

    /** Drops an image of the cell, freeing its memory. */
    private drop(image: CellImage): void {
        // Measured before its bitmap is closed, which sets its size to 0
        const bytes = CellImages.bytesOf(image.source);
        CellImages.release(image.source);
        this.images.delete(image.zoom);
        CellImages.bytes -= bytes;
        this.onDrop?.(image.zoom);
        if (this.images.size === 0) {
            CellImages.budget.delete(this);
        }
    }

    private static release(source: CellImageSource): void {
        // Without bitmaps, e.g. in the tests, the images are canvases freed by the garbage collector
        if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
            source.close();
        }
    }
}
