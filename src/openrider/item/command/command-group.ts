import { Vector } from 'canvade';
import type { PhysicsCell } from '../../grid/cell/physics-cell';
import { RenderCell } from '../../grid/cell/render-cell';
import { Grid } from '../../grid/grid';
import { CACHE_CELL_SIZE } from '../../grid/grid.constants';
import type { Track } from '../../track/track';
import type { Item } from '../item';
import { ITEM_SPRITE_MARGIN } from '../item-sprite';
import { Line } from '../line/line';
import type { TrackObject } from '../track-object';
import type { CommandArea } from './command-block';

/** Options of {@link CommandGroup.render}. */
export interface GroupRenderOptions {
    /** Visible part of the track, in world units. */
    view: CommandArea;
    /** Offset of the group for the player. */
    offset: Vector;
    /** Opacity of the lines of the layer, see `TrackLayer.opacityFactor`. */
    opacityFactor: number;
    /** Whether the densest tiles are rendered by the workers, see `RenderCell.getImage`. */
    fastRender: boolean;
}

/**
 * Objects bound to a command block, see `CommandRegistry`.
 *
 * The lines and item sprites are kept in a render grid of their own, cut in tiles like the render
 * cache of the layers: a group is drawn from the cached images of its visible tiles, shifted by
 * its offset, so that drawing a moving door costs a few images whatever its number of objects.
 * The items drawn on every frame are drawn over them, as in the cells of the layers (see
 * `Item.drawnLive`).
 */
export class CommandGroup {
    public readonly objects = new Set<TrackObject>();
    private readonly items = new Set<Item>();
    private readonly tiles = new Grid(CACHE_CELL_SIZE, RenderCell, ITEM_SPRITE_MARGIN);
    /** Physics cells storing a moved object along its way, besides its own cells. */
    private readonly extraCells = new Map<TrackObject, PhysicsCell[]>();
    /** Rectangle around the objects, computed again on demand once objects are removed. */
    private bounds: CommandArea | null = null;
    private boundsDirty = false;

    public get size(): number {
        return this.objects.size;
    }

    public add(object: TrackObject, extraCells: PhysicsCell[] = []): void {
        this.objects.add(object);
        if (object instanceof Line) {
            this.tiles.add(object);
        } else {
            this.items.add(object as Item);
            if ((object as Item).sprite !== null) {
                this.tiles.add(object);
            }
        }
        if (extraCells.length) {
            this.extraCells.set(object, extraCells);
        }
        if (!this.boundsDirty) {
            this.bounds = CommandGroup.extend(this.bounds, object);
        }
    }

    public remove(object: TrackObject): void {
        this.objects.delete(object);
        if (object instanceof Line) {
            this.tiles.remove(object);
        } else {
            this.items.delete(object as Item);
            if ((object as Item).sprite !== null) {
                this.tiles.remove(object);
            }
        }
        this.extraCells.get(object)?.forEach((cell) => cell.remove(object));
        this.extraCells.delete(object);
        this.boundsDirty = true;
    }

    /** Removes every object, freeing the images of the tiles. */
    public clear(): TrackObject[] {
        const objects = [...this.objects];
        objects.forEach((object) => this.remove(object));
        for (const tile of this.tiles.cells.values()) {
            tile.releaseImages();
        }
        this.tiles.cells.clear();
        this.bounds = null;
        this.boundsDirty = false;
        return objects;
    }

    /** Rectangle around the objects, null without objects. */
    private getBounds(): CommandArea | null {
        if (this.boundsDirty) {
            this.bounds = null;
            this.objects.forEach(
                (object) => (this.bounds = CommandGroup.extend(this.bounds, object)),
            );
            this.boundsDirty = false;
        }
        return this.bounds;
    }

    /**
     * Draws the group shifted by an offset, when it is in view: the cached images of the visible
     * tiles, then the items drawn on every frame.
     */
    public render(ctx: CanvasRenderingContext2D, track: Track, options: GroupRenderOptions): void {
        const { view, offset } = options;
        const bounds = this.getBounds();
        // Drawn around their positions: the round caps of the lines, the circles of the items
        const margin = 20;
        if (
            !bounds ||
            bounds.right + offset.x < view.left - margin ||
            bounds.left + offset.x > view.right + margin ||
            bounds.bottom + offset.y < view.top - margin ||
            bounds.top + offset.y > view.bottom + margin
        ) {
            return;
        }

        // Tiles both in view and around the objects, in the coordinates of the unmoved group
        const size = this.tiles.cellSize;
        const fromX = Math.floor(Math.max(view.left - offset.x, bounds.left - margin) / size);
        const toX = Math.floor(Math.min(view.right - offset.x, bounds.right + margin) / size);
        const fromY = Math.floor(Math.max(view.top - offset.y, bounds.top - margin) / size);
        const toY = Math.floor(Math.min(view.bottom - offset.y, bounds.bottom + margin) / size);
        const zoom = track.zoomFactor;

        for (let x = fromX; x <= toX; x++) {
            for (let y = fromY; y <= toY; y++) {
                if (!this.tiles.has(x, y)) {
                    continue;
                }
                const tile = this.tiles.cell(x, y);
                const image = tile.getImage(
                    zoom,
                    RenderCell.optionsFor(track, options.opacityFactor, options.fastRender),
                );
                if (image) {
                    CommandGroup.drawImage(
                        ctx,
                        track,
                        image.source,
                        image.zoom,
                        tile.x + offset.x,
                        tile.y + offset.y,
                    );
                }
            }
        }

        let shifted = false;
        for (const item of this.items) {
            if (!item.drawnLive) {
                continue;
            }
            if (!shifted) {
                shifted = true;
                ctx.save();
                ctx.translate(offset.x * zoom, offset.y * zoom);
                ctx.strokeStyle = '#000';
            }
            item.render(ctx);
        }
        if (shifted) {
            ctx.restore();
        }
    }

    /**
     * Draws a tile image at its world position, scaled when rendered at another zoom. The image
     * is drawn 1px up and left, as tiles bleed by 1px on each side (see `RenderCell`).
     */
    private static drawImage(
        ctx: CanvasRenderingContext2D,
        track: Track,
        source: CanvasImageSource & { width: number; height: number },
        imageZoom: number,
        worldX: number,
        worldY: number,
    ): void {
        const zoom = track.zoomFactor;
        const x = Math.floor(track.viewWidth / 2 + (worldX - track.camera.x) * zoom) - 1;
        const y = Math.floor(track.viewHeight / 2 + (worldY - track.camera.y) * zoom) - 1;
        if (imageZoom === zoom) {
            ctx.drawImage(source, x, y);
        } else {
            const scale = zoom / imageZoom;
            ctx.drawImage(source, x, y, source.width * scale, source.height * scale);
        }
    }

    private static extend(bounds: CommandArea | null, object: TrackObject): CommandArea {
        const { pos, endPos } = object;
        return {
            left: Math.min(bounds?.left ?? Infinity, pos.x, endPos.x),
            top: Math.min(bounds?.top ?? Infinity, pos.y, endPos.y),
            right: Math.max(bounds?.right ?? -Infinity, pos.x, endPos.x),
            bottom: Math.max(bounds?.bottom ?? -Infinity, pos.y, endPos.y),
        };
    }
}
