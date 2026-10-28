import { CACHE_CELL_SIZE } from '../grid/grid.constants';
import {
    drawItemSprites,
    ITEM_SPRITE_MARGIN,
    type ItemStamps,
    packItemSprites,
} from '../item/item-sprite';
import type { ReachableItem } from '../item/reachable-item';
import type { Track } from './track';
import type { TrackLayer } from './track-layer';

/** Largest side of an overlay image, in pixels: closer, the reached items are drawn directly. */
const MAX_OVERLAY_SIZE = 2048;

/** Reached items of a render cell, by the cell of their position, and their image. */
interface Overlay {
    /** Left of the cell, in world units. */
    x: number;
    /** Top of the cell, in world units. */
    y: number;
    /** Items in the order they were reached. */
    items: ReachableItem[];
    /** Number of items already drawn on the image. */
    drawn: number;
    /** Image of the drawn items, null until drawn or once an item left. */
    image: HTMLCanvasElement | null;
    /** Zoom the image is drawn at. */
    zoom: number;
    /** Whether items left the overlay, to remove from its list before drawing it again. */
    dirty: boolean;
}

/**
 * Items of a track the player reached during the run, drawn over their sprite in the reached
 * colors (see `ReachableItem.spriteColor`).
 *
 * They are drawn on an overlay image for each render cell, on top of the cell images: each item
 * is stamped once on the overlay of its cell when reached, as reaching only adds items until the
 * run restarts. A frame then draws one image per cell, however many items were reached; an item
 * leaving, on restart or erased, redraws its overlay. The images are drawn again at a new zoom
 * once the zoom stops changing, scaled meanwhile, and the items are drawn directly when the
 * zoom is too close for an image.
 *
 * The items of the command groups are drawn by their group.
 */
export class ReachedItems {
    private readonly items = new Set<ReachableItem>();
    /** Overlays of each layer, by `x,y` coordinates of their cell. */
    private readonly overlays = new Map<TrackLayer, Map<string, Overlay>>();
    /** Stamps of the overlays, kept between frames (see `drawItemSprites`). */
    private readonly stamps: ItemStamps = new Map();
    /** Zoom of the last frame, the images being drawn again once it stops changing. */
    private lastZoom = 0;

    public constructor(private readonly track: Track) {}

    public get size(): number {
        return this.items.size;
    }

    public has(item: ReachableItem): boolean {
        return this.items.has(item);
    }

    public [Symbol.iterator](): IterableIterator<ReachableItem> {
        return this.items.values();
    }

    /** Adds an item reached on the track, drawn on the overlay of its cell from the next frame. */
    public add(item: ReachableItem): void {
        if (this.items.has(item)) {
            return;
        }
        this.items.add(item);
        const overlay = this.overlayOf(item, true);
        overlay?.items.push(item);
    }

    /** Removes an item no longer reached or no longer on the track, its overlay drawn again. */
    public delete(item: ReachableItem): void {
        if (!this.items.delete(item)) {
            return;
        }
        // Removed from the list on the next frame: a restart removes every item at once
        const overlay = this.overlayOf(item, false);
        if (overlay) {
            overlay.dirty = true;
        }
    }

    /**
     * Overlay of the cell of an item, created when asked; none for the items of the command
     * groups, drawn by their group.
     */
    private overlayOf(item: ReachableItem, create: boolean): Overlay | null {
        if (!item.layer || item.command !== null) {
            return null;
        }
        let layerOverlays = this.overlays.get(item.layer);
        if (!layerOverlays) {
            layerOverlays = new Map();
            this.overlays.set(item.layer, layerOverlays);
        }
        const x = Math.floor(item.pos.x / CACHE_CELL_SIZE) * CACHE_CELL_SIZE;
        const y = Math.floor(item.pos.y / CACHE_CELL_SIZE) * CACHE_CELL_SIZE;
        const key = `${x},${y}`;
        let overlay = layerOverlays.get(key) ?? null;
        if (!overlay && create) {
            overlay = { x, y, items: [], drawn: 0, image: null, zoom: 0, dirty: false };
            layerOverlays.set(key, overlay);
        }
        return overlay;
    }

    /** Draws the reached items of a layer in view, over the cell images. */
    public render(ctx: CanvasRenderingContext2D, layer: TrackLayer): void {
        const layerOverlays = this.overlays.get(layer);
        if (!layerOverlays?.size) {
            return;
        }
        const track = this.track;
        const zoom = track.zoomFactor;
        const zooming = zoom !== this.lastZoom;
        this.lastZoom = zoom;
        if (this.stamps.size > 1024) {
            this.stamps.clear();
        }

        // The view in world units, an overlay reaching over the edges of its cell
        const margin = ITEM_SPRITE_MARGIN;
        const left = track.camera.x - track.viewWidth / 2 / zoom - margin;
        const right = track.camera.x + track.viewWidth / 2 / zoom + margin;
        const top = track.camera.y - track.viewHeight / 2 / zoom - margin;
        const bottom = track.camera.y + track.viewHeight / 2 / zoom + margin;

        for (const [key, overlay] of layerOverlays) {
            if (overlay.dirty) {
                overlay.items = overlay.items.filter((item) => this.items.has(item));
                overlay.drawn = 0;
                overlay.image = null;
                overlay.dirty = false;
                if (overlay.items.length === 0) {
                    layerOverlays.delete(key);
                    continue;
                }
            }
            const inView =
                overlay.x + CACHE_CELL_SIZE >= left &&
                overlay.x <= right &&
                overlay.y + CACHE_CELL_SIZE >= top &&
                overlay.y <= bottom;
            if (inView) {
                this.renderOverlay(ctx, overlay, zoom, zooming);
            }
        }
    }

    private renderOverlay(
        ctx: CanvasRenderingContext2D,
        overlay: Overlay,
        zoom: number,
        zooming: boolean,
    ): void {
        const track = this.track;
        const margin = ITEM_SPRITE_MARGIN;
        const size = Math.ceil((CACHE_CELL_SIZE + 2 * margin) * zoom);

        // Too close for an image: the few items in view drawn directly
        if (size > MAX_OVERLAY_SIZE) {
            overlay.image = null;
            const halfWidth = track.viewWidth / 2 / zoom + margin;
            const halfHeight = track.viewHeight / 2 / zoom + margin;
            this.draw(
                ctx,
                overlay.items.filter(
                    ({ pos }) =>
                        Math.abs(pos.x - track.camera.x) <= halfWidth &&
                        Math.abs(pos.y - track.camera.y) <= halfHeight,
                ),
                zoom,
                track.camera.x * zoom - track.viewWidth / 2,
                track.camera.y * zoom - track.viewHeight / 2,
            );
            return;
        }

        // Drawn again at the new zoom once it stops changing, scaled meanwhile
        if (!overlay.image || (overlay.zoom !== zoom && !zooming)) {
            const image = document.createElement('canvas');
            image.width = size;
            image.height = size;
            overlay.image = image;
            overlay.zoom = zoom;
            overlay.drawn = 0;
        }
        const image = overlay.image;
        if (overlay.drawn < overlay.items.length) {
            const context = image.getContext('2d');
            if (context) {
                this.draw(
                    context,
                    overlay.items.slice(overlay.drawn),
                    overlay.zoom,
                    (overlay.x - margin) * overlay.zoom,
                    (overlay.y - margin) * overlay.zoom,
                );
            }
            overlay.drawn = overlay.items.length;
        }

        const x = track.viewWidth / 2 + (overlay.x - margin - track.camera.x) * zoom;
        const y = track.viewHeight / 2 + (overlay.y - margin - track.camera.y) * zoom;
        if (overlay.zoom === zoom) {
            ctx.drawImage(image, x, y);
        } else {
            const scale = zoom / overlay.zoom;
            ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
        }
    }

    /** Stamps items, stacked copies once (see `packItemSprites`). */
    private draw(
        ctx: CanvasRenderingContext2D,
        items: ReachableItem[],
        zoom: number,
        offsetLeft: number,
        offsetTop: number,
    ): void {
        const { buffer, colors } = packItemSprites(items, true);
        drawItemSprites(
            ctx,
            new Float64Array(buffer),
            colors,
            zoom,
            offsetLeft,
            offsetTop,
            this.stamps,
        );
    }
}
