import { POST_SPACING } from './endurance.constants';
import { Point, SectionItem, SectionItemKind } from './terrain.types';

/**
 * Pen drawing the ground of a section from point to point, cutting it at the gaps, and placing
 * the distance posts where the ground crosses them.
 */
export class GroundPen {
    public readonly polylines: Point[][] = [];
    public readonly ceilings: Point[][] = [];
    public readonly scenery: Point[][] = [];
    public readonly items: SectionItem[] = [];
    public lowestY: number;
    private current: Point[];

    public constructor(
        public x: number,
        public y: number,
        private readonly originX: number,
    ) {
        this.current = [[x, y]];
        this.lowestY = y;
    }

    /** Draws the ground to a point, in whole world units as in the track codes. */
    public lineTo(x: number, y: number): void {
        const [toX, toY] = [Math.round(x), Math.round(y)];
        // Too short to be a line of the track
        if (Math.hypot(toX - this.x, toY - this.y) < 2) {
            return;
        }

        this.placePosts(toX, toY);
        this.current.push([toX, toY]);
        [this.x, this.y] = [toX, toY];
        this.lowestY = Math.max(this.lowestY, toY);
    }

    /**
     * Draws a curve from the position of the pen, sampled every 20 units or so.
     *
     * @param length - Horizontal length of the curve.
     * @param height - Height change of the curve, negative going up.
     * @param shape - Height at a part of the length, from 0 at the start to 1 at the end, both
     * between 0 and 1.
     */
    public curve(length: number, height: number, shape: (k: number) => number): void {
        const [x, y] = [this.x, this.y];
        const steps = Math.max(1, Math.ceil(length / 20));
        for (let step = 1; step <= steps; step++) {
            const k = step / steps;
            this.lineTo(x + length * k, y + height * shape(k));
        }
    }

    /** Leaves a gap in the ground up to a point, where the ground goes on. */
    public gapTo(x: number, y: number): void {
        this.endPolyline();
        [this.x, this.y] = [Math.round(x), Math.round(y)];
        this.current = [[this.x, this.y]];
        this.lowestY = Math.max(this.lowestY, this.y);
    }

    /** Adds a ceiling over the ground, solid too. */
    public addCeiling(points: Point[]): void {
        this.ceilings.push(points.map(([x, y]) => [Math.round(x), Math.round(y)]));
    }

    public addItem(kind: SectionItemKind, x: number, y: number, rotation = 0): void {
        this.items.push({ kind, x: Math.round(x), y: Math.round(y), rotation });
    }

    /** Ends the drawing, keeping the polylines of at least one line. */
    public finish(): Point[][] {
        this.endPolyline();
        return this.polylines;
    }

    private endPolyline(): void {
        if (this.current.length > 1) {
            this.polylines.push(this.current);
        }
    }

    /** A post with a flag at each multiple of the post spacing crossed by a line. */
    private placePosts(toX: number, toY: number): void {
        const first = Math.floor((this.x - this.originX) / POST_SPACING) + 1;
        const last = Math.floor((toX - this.originX) / POST_SPACING);
        for (let post = Math.max(first, 1); post <= last; post++) {
            const postX = this.originX + post * POST_SPACING;
            const postY = Math.round(this.y + ((toY - this.y) * (postX - this.x)) / (toX - this.x));
            this.scenery.push(
                [
                    [postX, postY],
                    [postX, postY - 80],
                ],
                [
                    [postX, postY - 80],
                    [postX + 30, postY - 70],
                    [postX, postY - 60],
                ],
            );
        }
    }
}
