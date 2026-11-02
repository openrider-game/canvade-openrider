import { Vector } from 'canvade';
import { ObjectTransform } from '../../edit/object-transform';
import type { CommandArea } from '../../item/command/command-block';
import { LinkedItemGroup } from '../../item/linked-item-group';
import type { TrackObject } from '../../item/track-object';
import type { Track } from '../../track/track';

/** Area of the world, see {@link CommandArea}. */
export type Area = CommandArea;

/** Color of the selection and of the objects being moved or pasted. */
export const SELECTION_COLOR = '#29f';

/** Area of objects, transformed, in world units. */
export function objectsArea(
    objects: readonly TrackObject[],
    transform = ObjectTransform.NONE,
): Area {
    const points = objects.flatMap((object) => [
        transform.point(object.pos),
        transform.point(object.endPos),
    ]);
    return {
        left: Math.min(...points.map(({ x }) => x)),
        top: Math.min(...points.map(({ y }) => y)),
        right: Math.max(...points.map(({ x }) => x)),
        bottom: Math.max(...points.map(({ y }) => y)),
    };
}

/**
 * Draws a crosshair at the pointer, as the drawing tools do, its arms ending with arrows over
 * the selection, which a drag moves.
 */
export function drawCrosshair(ctx: CanvasRenderingContext2D, track: Track, arrows: boolean): void {
    const { x, y } = track.toPixel(track.mousePos);
    const arm = arrows ? 12 : 10;
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    if (arrows) {
        // An arrowhead at the end of each arm
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const [tipX, tipY] = [x + dx * arm, y + dy * arm];
            ctx.moveTo(tipX - dx * 4 - dy * 4, tipY - dy * 4 - dx * 4);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(tipX - dx * 4 + dy * 4, tipY - dy * 4 + dx * 4);
        }
    }
    ctx.stroke();
}

/** Draws objects transformed: the lines in a single path, the items as circles. */
export function drawObjects(
    ctx: CanvasRenderingContext2D,
    track: Track,
    objects: readonly TrackObject[],
    transform: ObjectTransform,
): void {
    const radius = 9 * track.zoomFactor;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const object of objects) {
        const parts = object instanceof LinkedItemGroup ? object.instances : [object];
        for (const part of parts) {
            const pos = track.toPixel(transform.point(part.pos));
            if (part.kind === 'item') {
                ctx.moveTo(pos.x + radius, pos.y);
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
            } else {
                const end = track.toPixel(transform.point(part.endPos));
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(end.x, end.y);
            }
        }
    }
    ctx.stroke();
}

/** Draws an area, dashed, its corners transformed. */
export function drawArea(
    ctx: CanvasRenderingContext2D,
    track: Track,
    area: Area,
    transform: ObjectTransform,
): void {
    const corners = [
        new Vector(area.left, area.top),
        new Vector(area.right, area.top),
        new Vector(area.right, area.bottom),
        new Vector(area.left, area.bottom),
    ].map((corner) => track.toPixel(transform.point(corner)));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    corners.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

/**
 * Draws the rotation handle of the selection, transformed: a circle above the middle of its top
 * edge, linked to it, filled while under the pointer.
 *
 * @param handle - Position of the handle, in world units.
 * @param top - Top of the selection area, in world units.
 */
export function drawHandle(
    ctx: CanvasRenderingContext2D,
    track: Track,
    handle: Vector,
    top: number,
    transform: ObjectTransform,
    filled: boolean,
): void {
    const handlePx = track.toPixel(transform.point(handle));
    const centerPx = track.toPixel(transform.point(new Vector(handle.x, top)));
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerPx.x, centerPx.y);
    ctx.lineTo(handlePx.x, handlePx.y);
    ctx.moveTo(handlePx.x + 6, handlePx.y);
    ctx.arc(handlePx.x, handlePx.y, 6, 0, 2 * Math.PI);
    if (filled) {
        ctx.fillStyle = SELECTION_COLOR;
        ctx.fill();
    }
    ctx.stroke();
}
