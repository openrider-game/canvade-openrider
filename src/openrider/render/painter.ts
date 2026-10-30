import type { Line } from '../item/line/line';

/**
 * Drawing of a render cell, flattened so that it can be sent to a worker: its lines as
 * `[x1, y1, x2, y2, ...]` and its item sprites as `packItemSprites` does, in world units.
 */
export interface CellDrawing {
    zoom: number;
    opacityFactor: number;
    /** Left and top of the image drawn on, in canvas pixels at the zoom. */
    offsetLeft: number;
    offsetTop: number;
    scenery: Int32Array;
    lines: Int32Array;
    sprites: Float64Array;
    /** Fill colors of the sprites, by their color index. */
    spriteColors: string[];
}

/** Lines flattened as `[x1, y1, x2, y2, ...]` in world units, as a {@link CellDrawing} has them. */
export function flattenLines(lines: readonly Line[]): Int32Array {
    return new Int32Array(
        lines.flatMap((line) => [line.pos.x, line.pos.y, line.endPos.x, line.endPos.y]),
    );
}

/** Draws the lines and the items of the tracks, see {@link createPainter}. */
export interface Painter {
    /** Draws a render cell: its scenery lines, its solid lines, then its item sprites. */
    drawCell(ctx: PainterContext, drawing: CellDrawing): void;
    /**
     * Draws item sprites flattened by `packItemSprites`, filled with their color and outlined in
     * black, as the items look on the track.
     *
     * @param offsetLeft - Left of the image drawn on, in canvas pixels at the zoom.
     * @param offsetTop - Top of the image drawn on, in canvas pixels at the zoom.
     */
    drawSprites(
        ctx: PainterContext,
        sprites: Float64Array,
        colors: string[],
        zoom: number,
        offsetLeft: number,
        offsetTop: number,
    ): void;
    /**
     * Draws a single item, e.g. drawn on every frame or as a tool preview.
     *
     * @param shape - Code of the shape, see `spriteCode`.
     * @param x - Position of the item, in canvas pixels.
     * @param y - Position of the item, in canvas pixels.
     * @param rotation - Rotation of an arrow, pointing down at 0, in radians.
     */
    drawItem(
        ctx: PainterContext,
        shape: number,
        color: string,
        x: number,
        y: number,
        rotation: number,
        zoom: number,
    ): void;
}

/** Context a painter draws on: of a canvas, or of an offscreen canvas in the workers. */
export type PainterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Creates a painter of the tracks: the one drawing their cells, items and reached items on the
 * main thread (see {@link painter}), and the one of each render worker (see `WorkerPool`), so that
 * both draw the same, with a single implementation.
 *
 * It is serialized with `toString()` to create the workers: it must stay self-contained, without
 * imports nor outer references.
 *
 * Each item look (shape, color and rotation) is drawn once at a zoom in a small image, a stamp,
 * then copied for each item: copying an image costs a fraction of filling and stroking a path.
 * Without `OffscreenCanvas`, e.g. in the tests, the items are traced one by one.
 */
export function createPainter(): Painter {
    /** Stamps of the item looks, by shape, color, rotation and zoom; forgotten past a size. */
    const stamps = new Map<string, CanvasImageSource>();
    const MAX_STAMPS = 1024;

    /** Traces a closed polygon around a point, from its points relative to it in world units. */
    const polygon = (
        ctx: PainterContext,
        x: number,
        y: number,
        zoom: number,
        points: Array<[number, number]>,
    ) => {
        points.forEach(([px, py], i) =>
            i === 0
                ? ctx.moveTo(x + px * zoom, y + py * zoom)
                : ctx.lineTo(x + px * zoom, y + py * zoom),
        );
        ctx.closePath();
    };

    /** Points of a regular polygon of a radius, its first corner at an angle from the top. */
    const regular = (count: number, radius: number, angle = 0): Array<[number, number]> =>
        Array.from({ length: count }, (_, i) => {
            const a = angle + (2 * Math.PI * i) / count;
            return [Math.sin(a) * radius, -Math.cos(a) * radius];
        });

    /** Points of a star of a number of branches, between two radii. */
    const star = (branches: number, outer: number, inner: number): Array<[number, number]> =>
        Array.from({ length: 2 * branches }, (_, i) => {
            const a = (Math.PI * i) / branches;
            const radius = i % 2 === 0 ? outer : inner;
            return [Math.sin(a) * radius, -Math.cos(a) * radius];
        });

    /**
     * Shapes by their code (see `SHAPE_CODES` of `item-sprite.ts`), as points around the item in
     * world units, about 14 units wide: null for the circle and the arrow, traced apart.
     */
    const shapes: Array<Array<[number, number]> | null> = [
        // Circle
        null,
        // Square
        [
            [-7, -7],
            [7, -7],
            [7, 7],
            [-7, 7],
        ],
        // Arrow
        null,
        // Diamond
        regular(4, 9),
        // Octagon, as a stop sign
        regular(8, 8, Math.PI / 8),
        // Hexagon
        regular(6, 8),
        // Shield, pointing down
        [
            [-7, -7],
            [7, -7],
            [7, 1],
            [0, 8],
            [-7, 1],
        ],
        // Star
        star(5, 9, 4),
        // Triangle, pointing up
        [
            [0, -9],
            [8, 6],
            [-8, 6],
        ],
        // Trapezoid, as a weight
        [
            [-4, -6],
            [4, -6],
            [8, 7],
            [-8, 7],
        ],
        // Cross
        [
            [-8, -5],
            [-5, -8],
            [0, -3],
            [5, -8],
            [8, -5],
            [3, 0],
            [8, 5],
            [5, 8],
            [0, 3],
            [-5, 8],
            [-8, 5],
            [-3, 0],
        ],
        // Bow tie, two triangles mirroring each other
        [
            [-8, -7],
            [0, 0],
            [8, -7],
            [8, 7],
            [0, 0],
            [-8, 7],
        ],
    ];

    /** Traces the shape of an item around a point, the arrow pointing down turned by `rotation`. */
    const trace = (
        ctx: PainterContext,
        shape: number,
        x: number,
        y: number,
        rotation: number,
        zoom: number,
    ) => {
        ctx.beginPath();
        const points = shapes[shape];
        if (points) {
            polygon(ctx, x, y, zoom, points);
        } else if (shape === 2) {
            const cos = Math.cos(rotation) * zoom;
            const sin = Math.sin(rotation) * zoom;
            ctx.moveTo(x - 7 * cos + 10 * sin, y - 7 * sin - 10 * cos);
            ctx.lineTo(x - 10 * sin, y + 10 * cos);
            ctx.lineTo(x + 7 * cos + 10 * sin, y + 7 * sin - 10 * cos);
            ctx.lineTo(x - 7 * cos + 10 * sin, y - 7 * sin - 10 * cos);
        } else {
            ctx.moveTo(x + 7 * zoom, y);
            ctx.arc(x, y, 7 * zoom, 0, 2 * Math.PI, true);
        }
    };

    /** Sets the styles of the items, as they look on the track. */
    const styleItems = (ctx: PainterContext, zoom: number) => {
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.strokeStyle = '#000';
        // Unlike the round caps of the lines
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
    };

    /** Half the size of a stamp: the farthest corners, the outline and a pixel of margin. */
    const stampHalf = (zoom: number) => Math.ceil(12.3 * zoom + Math.max(2 * zoom, 0.5)) + 1;

    const stamp = (shape: number, color: string, rotation: number, zoom: number) => {
        const key = `${shape} ${color} ${rotation} ${zoom}`;
        let image = stamps.get(key);
        if (!image) {
            const half = stampHalf(zoom);
            const canvas = new OffscreenCanvas(2 * half, 2 * half);
            const context = canvas.getContext('2d');
            if (context) {
                styleItems(context, zoom);
                context.fillStyle = color;
                trace(context, shape, half, half, rotation, zoom);
                context.fill();
                context.stroke();
            }
            if (stamps.size >= MAX_STAMPS) {
                stamps.clear();
            }
            image = canvas;
            stamps.set(key, image);
        }
        return image;
    };

    const drawItem: Painter['drawItem'] = (ctx, shape, color, x, y, rotation, zoom) => {
        ctx.save();
        styleItems(ctx, zoom);
        if (typeof OffscreenCanvas !== 'undefined') {
            const half = stampHalf(zoom);
            ctx.drawImage(stamp(shape, color, rotation, zoom), x - half, y - half);
        } else {
            ctx.fillStyle = color;
            trace(ctx, shape, x, y, rotation, zoom);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    };

    const drawSprites: Painter['drawSprites'] = (
        ctx,
        sprites,
        colors,
        zoom,
        offsetLeft,
        offsetTop,
    ) => {
        ctx.save();
        styleItems(ctx, zoom);
        const stamped = typeof OffscreenCanvas !== 'undefined';
        const half = stampHalf(zoom);
        for (let i = 0; i + 4 < sprites.length; i += 5) {
            const x = sprites[i + 2] * zoom - offsetLeft;
            const y = sprites[i + 3] * zoom - offsetTop;
            const color = colors[sprites[i + 1]];
            if (stamped) {
                ctx.drawImage(stamp(sprites[i], color, sprites[i + 4], zoom), x - half, y - half);
            } else {
                ctx.fillStyle = color;
                trace(ctx, sprites[i], x, y, sprites[i + 4], zoom);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.restore();
    };

    /**
     * Strokes lines flattened as `[x1, y1, x2, y2, ...]`, in world units, as a single path: the
     * lines of a translucent layer do not darken where they cross, the layer being seen through
     * as a whole.
     */
    const drawLines = (
        ctx: PainterContext,
        lines: Int32Array,
        zoom: number,
        offsetLeft: number,
        offsetTop: number,
    ) => {
        if (lines.length < 4) {
            return;
        }
        ctx.beginPath();
        for (let i = 0; i + 3 < lines.length; i += 4) {
            ctx.moveTo(lines[i] * zoom - offsetLeft, lines[i + 1] * zoom - offsetTop);
            ctx.lineTo(lines[i + 2] * zoom - offsetLeft, lines[i + 3] * zoom - offsetTop);
        }
        ctx.stroke();
    };

    const drawCell: Painter['drawCell'] = (ctx, drawing) => {
        const { zoom, offsetLeft, offsetTop } = drawing;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.globalAlpha = drawing.opacityFactor;
        // The colors of the scenery and of the solid lines, see `SCENERY_STROKE_STYLE`
        ctx.strokeStyle = '#aaa';
        drawLines(ctx, drawing.scenery, zoom, offsetLeft, offsetTop);
        ctx.strokeStyle = '#000';
        drawLines(ctx, drawing.lines, zoom, offsetLeft, offsetTop);
        if (drawing.sprites.length) {
            drawSprites(ctx, drawing.sprites, drawing.spriteColors, zoom, offsetLeft, offsetTop);
        }
    };

    return { drawCell, drawSprites, drawItem };
}

/** Painter of the main thread, see {@link createPainter}. */
export const painter = createPainter();
