import { CACHE_CELL_SIZE } from '../grid/grid.constants';
import { ITEM_SPRITE_MARGIN, packItemSprites } from '../item/item-sprite';
import type { ReachableItem } from '../item/reachable-item';
import { painter } from '../render/painter';
import type { Track } from './track';
import type { TrackLayer } from './track-layer';
import type { GridBounds } from './track-renderer';

/** Largest side of an overlay image, in pixels: closer, the reached items are drawn directly. */
const MAX_OVERLAY_SIZE = 2048;

/** Reached items of a render cell, by the cell of their position, and their image. */
interface Overlay {
    /** Left and top of the cell, in world units. */
    x: number;
    y: number;
    /** Items in the order they were reached. */
    items: ReachableItem[];
    /** Image of the items, null until drawn, or once an item left; and its zoom. */
    image: HTMLCanvasElement | null;
    zoom: number;
    /** Number of items already drawn on the image. */
    drawn: number;
    /**
     * Whether items left, to take out of the list once before drawing the image again: a restart
     * unreaching thousands of items one by one filters each list once.
     */
    dirty: boolean;
}

/**
 * Items of a track the player reached during the run, drawn over their sprite in the reached
 * colors (see `ReachableItem.spriteColor`).
 *
 * They are drawn on an overlay image for each render cell, over the cell images: an item reached
 * is only stamped on the image of its cell, as reaching items only adds some until the run
 * restarts, so that a frame draws one image per cell however many items were reached. An item
 * leaving, e.g. erased, has its image drawn again; a restart drops them all. The images follow
 * the zoom once it settles, scaled meanwhile (see `Track.zoomSettled`), and the items are drawn
 * directly when the zoom is too close for an image.
 *
 * The items of the command groups are drawn by their group.
 */
export class ReachedItems {
    private readonly items = new Set<ReachableItem>();
    /** Overlays of each layer, by grid coordinates of their render cell. */
    private readonly overlays = new Map<TrackLayer, Map<string, Overlay>>();

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

    /** Adds an item reached on the track, stamped on the overlay of its cell on the next frame. */
    public add(item: ReachableItem): void {
        if (this.items.has(item)) {
            return;
        }
        this.items.add(item);
        this.overlayOf(item, true)?.items.push(item);
    }

    /** Removes an item no longer reached or no longer on the track, its overlay drawn again. */
    public delete(item: ReachableItem): void {
        if (!this.items.delete(item)) {
            return;
        }
        // A restart leaves none: every overlay at once
        if (this.items.size === 0) {
            this.overlays.clear();
            return;
        }
        const overlay = this.overlayOf(item, false);
        if (overlay) {
            overlay.dirty = true;
        }
    }

    /** Draws the reached items of a layer in view, over the images of its cells. */
    public render(ctx: CanvasRenderingContext2D, layer: TrackLayer, view: GridBounds): void {
        const layerOverlays = this.overlays.get(layer);
        if (!layerOverlays?.size) {
            return;
        }
        // The overlays of the cells around the view too, their items reaching over its edges
        const { topLeft, bottomRight } = view;
        for (let x = topLeft.x - 1; x <= bottomRight.x + 1; x++) {
            for (let y = topLeft.y - 1; y <= bottomRight.y + 1; y++) {
                const overlay = layerOverlays.get(`${x},${y}`);
                if (overlay?.dirty) {
                    overlay.items = overlay.items.filter((item) => this.items.has(item));
                    overlay.image = null;
                    overlay.dirty = false;
                }
                if (overlay?.items.length) {
                    this.renderOverlay(ctx, overlay);
                }
            }
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
        const cellX = Math.floor(item.pos.x / CACHE_CELL_SIZE);
        const cellY = Math.floor(item.pos.y / CACHE_CELL_SIZE);
        const key = `${cellX},${cellY}`;
        let overlay = layerOverlays.get(key) ?? null;
        if (!overlay && create) {
            overlay = {
                x: cellX * CACHE_CELL_SIZE,
                y: cellY * CACHE_CELL_SIZE,
                items: [],
                image: null,
                zoom: 0,
                drawn: 0,
                dirty: false,
            };
            layerOverlays.set(key, overlay);
        }
        return overlay;
    }

    private renderOverlay(ctx: CanvasRenderingContext2D, overlay: Overlay): void {
        const track = this.track;
        const zoom = track.zoomFactor;
        const margin = ITEM_SPRITE_MARGIN;
        // Left and top of the image on the canvas, at the zoom of the frame
        const left = track.viewWidth / 2 + (overlay.x - margin - track.camera.x) * zoom;
        const top = track.viewHeight / 2 + (overlay.y - margin - track.camera.y) * zoom;

        // Too close for an image: its items drawn directly, cut to the canvas
        const size = Math.ceil((CACHE_CELL_SIZE + 2 * margin) * zoom);
        if (size > MAX_OVERLAY_SIZE) {
            overlay.image = null;
            const offsetLeft = track.camera.x * zoom - track.viewWidth / 2;
            const offsetTop = track.camera.y * zoom - track.viewHeight / 2;
            ReachedItems.stamp(ctx, overlay.items, zoom, offsetLeft, offsetTop);
            return;
        }

        // At the zoom once it settles, scaled meanwhile
        if (!overlay.image || (overlay.zoom !== zoom && track.zoomSettled)) {
            overlay.image = document.createElement('canvas');
            overlay.image.width = size;
            overlay.image.height = size;
            overlay.zoom = zoom;
            overlay.drawn = 0;
        }
        const image = overlay.image;
        if (overlay.drawn < overlay.items.length) {
            const context = image.getContext('2d');
            if (context) {
                ReachedItems.stamp(
                    context,
                    overlay.items.slice(overlay.drawn),
                    overlay.zoom,
                    (overlay.x - margin) * overlay.zoom,
                    (overlay.y - margin) * overlay.zoom,
                );
            }
            overlay.drawn = overlay.items.length;
        }

        const scale = zoom / overlay.zoom;
        ctx.drawImage(image, left, top, image.width * scale, image.height * scale);
    }

    /**
     * Stamps items in their colors of the moment, stacked copies once (see `packItemSprites`).
     *
     * @param offsetLeft - Left of the image drawn on, in canvas pixels at the zoom.
     * @param offsetTop - Top of the image drawn on, in canvas pixels at the zoom.
     */
    private static stamp(
        ctx: CanvasRenderingContext2D,
        items: ReachableItem[],
        zoom: number,
        offsetLeft: number,
        offsetTop: number,
    ): void {
        const { buffer, colors } = packItemSprites(items, true);
        painter.drawSprites(ctx, new Float64Array(buffer), colors, zoom, offsetLeft, offsetTop);
    }
}
