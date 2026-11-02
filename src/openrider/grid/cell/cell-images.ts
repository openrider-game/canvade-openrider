/**
 * Images kept by a cell, the least recently displayed ones being dropped past it, but the one of
 * the lowest zoom, a fallback always at hand.
 */
export const MAX_CELL_IMAGES = 6;

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
 */
export class CellImages {
    private readonly images = new Map<number, CellImage>();

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
        this.images.delete(image.zoom);
        this.images.set(image.zoom, image);
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
            CellImages.release(current.source);
            this.images.delete(zoom);
        }
        const stored = { source, zoom, version };
        this.images.set(zoom, stored);
        return stored;
    }

    /**
     * Drops the least recently displayed images past {@link MAX_CELL_IMAGES}, but the one of the
     * lowest zoom, and the one just stored.
     *
     * @param zoom - Zoom of the image just stored.
     */
    public evict(zoom: number): void {
        const lowest = Math.min(...this.images.keys());
        for (const kept of this.images.keys()) {
            if (this.images.size <= MAX_CELL_IMAGES) {
                break;
            }
            if (kept !== lowest && kept !== zoom) {
                CellImages.release(this.images.get(kept)!.source);
                this.images.delete(kept);
            }
        }
    }

    /** Frees every image, e.g. once the cell is discarded. */
    public clear(): void {
        this.images.forEach((image) => CellImages.release(image.source));
        this.images.clear();
    }

    private static release(source: CellImageSource): void {
        // Without bitmaps, e.g. in the tests, the images are canvases freed by the garbage collector
        if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
            source.close();
        }
    }
}
