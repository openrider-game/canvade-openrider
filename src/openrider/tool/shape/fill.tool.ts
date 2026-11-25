import { BACKSPACE, Control, ENTER, ESCAPE, KEYH, Vector } from 'canvade';
import {
    EnclosedArea,
    EnclosedAreaError,
    floodArea,
    hatchEnclosed,
    isInArea,
    WallGrid,
    wallGrid,
} from '../../numeric/enclosed-area';
import { hatch, HatchPattern, HatchResult, HatchSegment } from '../../numeric/hatch';
import { LinePath } from '../../numeric/line-path';
import { DrawingLines } from '../line/drawing-lines';
import { ToolIcon, ToolOption } from '../tool';
import { fillIcon, SOLID_FILL_ICON } from '../tool-icons';
import { ShapeTool } from './shape.tool';

/**
 * How the area to fill is drawn: a polygon clicked corner by corner, a rectangle dragged, or an
 * area already closed by lines, clicked inside.
 */
export type FillArea = 'polygon' | 'rectangle' | 'enclosed';

/** The areas in the order the option goes through them. */
const FILL_AREAS: readonly FillArea[] = ['polygon', 'rectangle', 'enclosed'];

/**
 * Side of the cells an area closed by lines is searched on, in canvas pixels: the gaps between
 * lines narrower than it on screen are closed.
 */
export const ENCLOSED_CELL_PIXELS = 4;

/** Distances between the lines, in world units. */
export const FILL_SPACINGS = [1, 5, 10, 15, 20, 30, 40, 60, 80, 100] as const;

/** Step of the angle of the lines, in degrees. */
export const FILL_ANGLE_STEP = 15;

/**
 * Most lines added by a fill, the outline included: past it, nothing is added, the spacing having
 * to be wider. It keeps the track code and the line store from growing by accident.
 */
export const MAX_FILL_LINES = 2000;

/** Most corners of a polygon. */
export const MAX_FILL_CORNERS = 100;

/** Distance from the first corner closing the polygon when clicked, in canvas pixels. */
const CLOSE_DISTANCE = 10;

/** Smallest side of a rectangle, in world units: a click without dragging fills nothing. */
const MIN_RECTANGLE_SIDE = 5;

/** Drags longer than this, in canvas pixels, are not clicks inside an area. */
const CLICK_DISTANCE = 4;

/** The lines filling an area closed by lines, or why there are none. */
interface EnclosedFill {
    segments: [Vector, Vector][];
    overflow: boolean;
    error: EnclosedAreaError | null;
}

/** The lines of a layer and their grid on screen, for the areas closed by lines. */
interface EnclosedGrid {
    layer: unknown;
    /** The version of the lines of the layer, the view and the zoom they were made for. */
    key: string;
    lines: HatchSegment[];
    grid: WallGrid;
}

/** What is under the pointer: an area and its lines, or a cell without area and why. */
type Hovered =
    | { grid: EnclosedGrid; area: EnclosedArea; choices: string; fill: EnclosedFill }
    | { grid: EnclosedGrid; cell: number; fill: EnclosedFill };

/**
 * Fills an area with a pattern of lines, solid or scenery as chosen for the drawing tools: lines at
 * an angle and a spacing, crossed or not by perpendicular ones, and the outline of the area if
 * chosen (see {@link hatch}). A fill is added and undone at once.
 *
 * The area is a polygon, clicked corner by corner and closed by clicking its first corner again,
 * pressing Enter or the Fill option; Backspace removes the last corner and Escape the polygon. Or
 * it is a rectangle, dragged from one corner to the other. The preview shows the lines added.
 *
 * Or it is an area closed by the lines of the active layer, solid or scenery, clicked inside and
 * filled at once (see {@link findEnclosedArea}): it is searched on screen, an area reaching the
 * edge of the screen being open, and the gaps between its lines narrower than
 * {@link ENCLOSED_CELL_PIXELS} on screen are closed. Its lines are its outline already.
 *
 * The choices of the fill are kept from a use of the tool to the next.
 */
export class FillTool extends ShapeTool {
    public static override readonly toolName: string = 'Fill';
    public static override readonly key = new Control(KEYH);
    public static override readonly icon = SOLID_FILL_ICON;

    public static area: FillArea = 'polygon';
    public static pattern: HatchPattern = 'parallel';
    public static spacing: number = 20;
    /** Angle of the lines, in degrees, from 0 to 165. */
    public static angle: number = 45;
    public static outline = false;

    /** Gives the choices of the fill their defaults back, e.g. between tests. */
    public static resetChoices(): void {
        FillTool.area = 'polygon';
        FillTool.pattern = 'parallel';
        FillTool.spacing = 20;
        FillTool.angle = 45;
        FillTool.outline = false;
    }

    /** Corners of the polygon clicked so far, rounded to whole world units. */
    private corners: Vector[] = [];
    /** Why the last fill was refused, shown in the options until the next one. */
    private refusal: string | null = null;
    /** The grid of the lines on screen, see {@link FillTool.enclosedGrid}. */
    private walls: EnclosedGrid | null = null;
    /** What was found under the pointer, see {@link FillTool.enclosedFill}. */
    private hovered: Hovered | null = null;

    public override getIcon(): ToolIcon {
        return fillIcon(DrawingLines.strokeColor);
    }

    public override deactivate(): void {
        super.deactivate();
        this.restart();
        // Not kept while another tool edits the track
        this.walls = null;
        this.hovered = null;
    }

    public override onMouseDown(): void {
        this.mouseDown = true;
    }

    public override onMouseUp(): void {
        if (!this.mouseDown) {
            return;
        }
        this.mouseDown = false;

        if (FillTool.area === 'rectangle') {
            const rectangle = this.rectangle();
            if (rectangle) {
                this.fill(rectangle);
            }
            return;
        }
        if (FillTool.area === 'enclosed') {
            const dragged = this.track
                .toPixel(this.track.lastClick)
                .distanceTo(this.track.toPixel(this.track.mousePos));
            if (dragged <= CLICK_DISTANCE) {
                this.fillEnclosed(this.track.mousePos.clone());
            }
            return;
        }
        this.click();
    }

    public override onKeyDown(e: KeyboardEvent): boolean {
        if (FillTool.area !== 'polygon' || this.corners.length === 0) {
            return false;
        }
        if (e.key === ENTER) {
            this.close();
        } else if (e.key === ESCAPE) {
            this.restart();
        } else if (e.key === BACKSPACE) {
            this.corners.pop();
            this.track.invalidateUI();
        } else {
            return false;
        }
        return true;
    }

    protected override getShapeOptions(): ToolOption[] {
        const options: ToolOption[] = [
            {
                label: `Area: ${FillTool.area}`,
                action: this.change(() => {
                    const next = (FILL_AREAS.indexOf(FillTool.area) + 1) % FILL_AREAS.length;
                    FillTool.area = FILL_AREAS[next];
                    this.corners = [];
                }),
            },
            {
                label: `Pattern: ${FillTool.pattern === 'cross' ? 'crossed' : 'parallel'}`,
                action: this.change(() => {
                    FillTool.pattern = FillTool.pattern === 'cross' ? 'parallel' : 'cross';
                }),
            },
            this.spacingOption(),
            this.angleOption(),
        ];
        // The lines of an area closed by lines are its outline already
        if (FillTool.area !== 'enclosed') {
            options.push({
                label: `Outline: ${FillTool.outline ? 'yes' : 'no'}`,
                action: this.change(() => (FillTool.outline = !FillTool.outline)),
            });
        }

        if (FillTool.area === 'enclosed') {
            options.push({ label: 'Next: click inside closed lines' });
        } else if (FillTool.area === 'rectangle') {
            options.push({ label: 'Next: drag across the area' });
        } else if (this.corners.length === 0) {
            options.push({ label: 'Next: click its corners' });
        } else {
            const count = this.corners.length;
            options.push({ label: `${count} ${count === 1 ? 'corner' : 'corners'}` });
            if (count >= 3) {
                options.push({ label: 'Fill', action: () => this.close() });
            }
            options.push({ label: 'Restart', action: () => this.restart() });
        }
        if (this.refusal !== null) {
            options.push({ label: this.refusal });
        }
        return options;
    }

    public override render(ctx: CanvasRenderingContext2D): void {
        super.render(ctx);
        if (FillTool.area === 'rectangle') {
            const rectangle = this.mouseDown ? this.rectangle() : null;
            if (rectangle) {
                this.renderFill(ctx, rectangle, true);
            }
        } else if (FillTool.area === 'enclosed') {
            if (!this.mouseDown) {
                this.renderEnclosed(ctx);
            }
        } else if (this.corners.length) {
            this.renderFill(
                ctx,
                [...this.corners, FillTool.round(this.track.mousePos)],
                this.closing(),
            );
        }
    }

    /** Draws the lines that a click would add in the area under the pointer, or a warning. */
    private renderEnclosed(ctx: CanvasRenderingContext2D): void {
        const { segments, overflow, error } = this.enclosedFill(this.track.mousePos);
        if (error !== null) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = DrawingLines.strokeStyle;
        if (overflow) {
            const mouse = this.track.toPixel(this.track.mousePos);
            ctx.fillStyle = DrawingLines.strokeStyle;
            ctx.font = '14px sans-serif';
            ctx.fillText(`Over ${MAX_FILL_LINES} lines`, mouse.x + 14, mouse.y - 14);
        } else {
            // Lighter than the lines added, a preview
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = Math.max(2 * this.track.zoomFactor, 0.5);
            ctx.lineCap = 'round';
            LinePath.render(
                ctx,
                segments.map(([start, end]) => [
                    this.track.toPixel(start),
                    this.track.toPixel(end),
                ]),
            );
        }
        ctx.restore();
    }

    /** A click of the polygon: closes it on its first corner, else adds a corner. */
    private click(): void {
        if (this.closing()) {
            this.close();
            return;
        }
        const corner = FillTool.round(this.track.mousePos);
        const last = this.corners[this.corners.length - 1];
        if (last && last.x === corner.x && last.y === corner.y) {
            return;
        }
        if (this.corners.length >= MAX_FILL_CORNERS) {
            this.refusal = `${MAX_FILL_CORNERS} corners at most`;
        } else {
            this.corners.push(corner);
        }
        this.track.invalidateUI();
    }

    /** Whether the mouse is on the first corner of a polygon that can be closed. */
    private closing(): boolean {
        if (this.corners.length < 3) {
            return false;
        }
        const first = this.track.toPixel(this.corners[0]);
        return first.distanceTo(this.track.toPixel(this.track.mousePos)) <= CLOSE_DISTANCE;
    }

    /** Fills the polygon clicked, once it has 3 corners. */
    private close(): void {
        if (this.corners.length < 3) {
            return;
        }
        if (this.fill(this.corners)) {
            this.restart();
        }
    }

    /**
     * Adds the lines filling an area, and its outline when chosen.
     *
     * @returns Whether they were added: not when there would be too many.
     */
    private fill(area: Vector[]): boolean {
        const { segments, overflow } = this.hatch(area);
        if (overflow) {
            this.refusal = `Over ${MAX_FILL_LINES} lines: widen the spacing`;
            this.track.invalidateUI();
            return false;
        }
        this.refusal = null;
        this.addSegments(segments);
        this.track.invalidateUI();
        return true;
    }

    /**
     * Fills the area closed by the lines of the active layer around a point, the lines stopping on
     * them: the lines its preview shows.
     *
     * @returns Whether lines were added: not when the point is on a line, outside any closed
     *   area on screen, or when there would be too many.
     */
    private fillEnclosed(point: Vector): boolean {
        const found = this.enclosedFill(point);
        if (found.error === 'on-line') {
            return this.refuse('Clicked on a line');
        }
        if (found.error === 'open') {
            return this.refuse('Not closed on screen');
        }
        if (found.overflow) {
            return this.refuse(`Over ${MAX_FILL_LINES} lines: widen the spacing`);
        }
        this.refusal = null;
        this.addSegments(found.segments);
        this.track.invalidateUI();
        return true;
    }

    /**
     * The lines filling the area closed by lines around a point, rounded to whole world units, or
     * why there are none.
     *
     * Computed again only when needed, so that the preview follows the pointer: the grid of the
     * lines when the lines of the active layer, the view or the zoom change, the area when the
     * point leaves it, and its lines when the choices of the fill change.
     */
    private enclosedFill(point: Vector): EnclosedFill {
        const grid = this.enclosedGrid();
        const choices = `${FillTool.angle}|${FillTool.spacing}|${FillTool.pattern}`;
        const hovered = this.hovered;
        if (hovered?.grid === grid) {
            if ('area' in hovered && isInArea(hovered.area, point)) {
                if (hovered.choices !== choices) {
                    hovered.choices = choices;
                    hovered.fill = this.hatchArea(hovered.area, grid.lines);
                }
                return hovered.fill;
            }
            if ('cell' in hovered && hovered.cell === FillTool.cellOf(grid.grid, point)) {
                return hovered.fill;
            }
        }

        const area = floodArea(grid.grid, point);
        if (typeof area === 'string') {
            const fill: EnclosedFill = { segments: [], overflow: false, error: area };
            this.hovered = { grid, cell: FillTool.cellOf(grid.grid, point), fill };
            return fill;
        }
        const fill = this.hatchArea(area, grid.lines);
        this.hovered = { grid, area, choices, fill };
        return fill;
    }

    /** The lines filling an area, rounded to whole world units. */
    private hatchArea(area: EnclosedArea, lines: HatchSegment[]): EnclosedFill {
        const result = hatchEnclosed(area, lines, {
            angle: FillTool.angle,
            spacing: FillTool.spacing,
            pattern: FillTool.pattern,
            maxSegments: MAX_FILL_LINES,
        });
        return {
            segments: result.segments.map(([start, end]): [Vector, Vector] => [
                FillTool.round(start),
                FillTool.round(end),
            ]),
            overflow: result.overflow,
            error: null,
        };
    }

    /**
     * The lines of the active layer and their grid on screen, made again when the lines, the view
     * or the zoom change.
     */
    private enclosedGrid(): EnclosedGrid {
        const layer = this.track.layers.active;
        const corners = [
            this.track.toWorld(new Vector(0, 0)),
            this.track.toWorld(new Vector(this.track.viewWidth, this.track.viewHeight)),
        ];
        const window = {
            min: new Vector(
                Math.min(corners[0].x, corners[1].x),
                Math.min(corners[0].y, corners[1].y),
            ),
            max: new Vector(
                Math.max(corners[0].x, corners[1].x),
                Math.max(corners[0].y, corners[1].y),
            ),
        };
        const cell = ENCLOSED_CELL_PIXELS / this.track.zoomFactor;
        const key = [
            layer.grid.version,
            window.min.x,
            window.min.y,
            window.max.x,
            window.max.y,
            cell,
        ]
            .map((value) => Math.round(value * 100))
            .join('|');
        if (this.walls?.layer === layer && this.walls.key === key) {
            return this.walls;
        }

        const lines: HatchSegment[] = [
            ...layer.grid.totalSolidLines.values(),
            ...layer.grid.totalSceneryLines.values(),
        ].map((line) => [line.pos, line.endPos]);
        this.walls = { layer, key, lines, grid: wallGrid(lines, window, cell) };
        this.hovered = null;
        return this.walls;
    }

    /** Index of the cell of a grid holding a point. */
    private static cellOf(grid: WallGrid, point: Vector): number {
        const column = Math.floor((point.x - grid.origin.x) / grid.cell);
        const row = Math.floor((point.y - grid.origin.y) / grid.cell);
        return row * grid.columns + column;
    }

    /** Tells in the options why a fill was refused. */
    private refuse(reason: string): false {
        this.refusal = reason;
        this.track.invalidateUI();
        return false;
    }

    /** The lines filling an area, rounded to whole world units, with its outline when chosen. */
    private hatch(area: Vector[]): HatchResult {
        const outline: [Vector, Vector][] = FillTool.outline
            ? area.map((corner, i) => [corner, area[(i + 1) % area.length]])
            : [];
        const result = hatch(area, {
            angle: FillTool.angle,
            spacing: FillTool.spacing,
            pattern: FillTool.pattern,
            maxSegments: MAX_FILL_LINES - outline.length,
        });
        if (result.overflow) {
            return result;
        }
        const segments = result.segments.map(([start, end]): [Vector, Vector] => [
            FillTool.round(start),
            FillTool.round(end),
        ]);
        return { segments: [...segments, ...outline], overflow: false };
    }

    /** Draws an area being drawn and the lines filling it, or a warning when too many. */
    private renderFill(ctx: CanvasRenderingContext2D, area: Vector[], closed: boolean): void {
        const pixels = area.map((corner) => this.track.toPixel(corner));
        ctx.save();
        ctx.lineWidth = Math.max(2 * this.track.zoomFactor, 0.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = DrawingLines.strokeStyle;

        // The outline, dashed unless added, closed once it can be
        ctx.setLineDash(FillTool.outline ? [] : [6, 6]);
        LinePath.render(ctx, [closed || area.length >= 3 ? [...pixels, pixels[0]] : pixels]);
        ctx.setLineDash([]);

        if (area.length >= 3) {
            const { segments, overflow } = this.hatch(area);
            if (overflow) {
                const mouse = this.track.toPixel(this.track.mousePos);
                ctx.fillStyle = DrawingLines.strokeStyle;
                ctx.font = '14px sans-serif';
                ctx.fillText(`Over ${MAX_FILL_LINES} lines`, mouse.x + 14, mouse.y - 14);
            } else {
                LinePath.render(
                    ctx,
                    segments.map(([start, end]) => [
                        this.track.toPixel(start),
                        this.track.toPixel(end),
                    ]),
                );
            }
        }
        // The first corner, closing the polygon when clicked
        if (FillTool.area === 'polygon') {
            ctx.beginPath();
            ctx.arc(pixels[0].x, pixels[0].y, closed ? 7 : 4, 0, 2 * Math.PI);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** Corners of the rectangle from the press position to the mouse, null when too thin. */
    private rectangle(): Vector[] | null {
        const a = FillTool.round(this.track.lastClick);
        const b = FillTool.round(this.track.mousePos);
        if (Math.abs(a.x - b.x) < MIN_RECTANGLE_SIDE || Math.abs(a.y - b.y) < MIN_RECTANGLE_SIDE) {
            return null;
        }
        return [a, new Vector(b.x, a.y), b, new Vector(a.x, b.y)];
    }

    /** Option of the spacing: `−` and `+` step through the spacings, a click to the next one. */
    private spacingOption(): ToolOption {
        const spacing = FillTool.spacing;
        const set = (value: number) => this.change(() => (FillTool.spacing = value))();
        const next = FILL_SPACINGS.find((value) => value > spacing);
        return {
            label: `Spacing: ${spacing}`,
            action: () => set(next ?? FILL_SPACINGS[0]),
            steps: {
                down: () =>
                    set(
                        [...FILL_SPACINGS].reverse().find((value) => value < spacing) ??
                            FILL_SPACINGS[0],
                    ),
                up: () => set(next ?? FILL_SPACINGS[FILL_SPACINGS.length - 1]),
            },
        };
    }

    /** Option of the angle: turns by steps of 15 degrees, a half turn being the same lines. */
    private angleOption(): ToolOption {
        const turn = (by: number) =>
            this.change(() => (FillTool.angle = (FillTool.angle + by + 180) % 180));
        return {
            label: `Angle: ${FillTool.angle}°`,
            action: turn(FILL_ANGLE_STEP),
            steps: { down: turn(-FILL_ANGLE_STEP), up: turn(FILL_ANGLE_STEP) },
        };
    }

    /** An action of an option, refreshing the options once done. */
    private change(action: () => void): () => void {
        return () => {
            action();
            this.refusal = null;
            this.track.invalidateUI();
        };
    }

    /** Starts a new polygon. */
    private restart(): void {
        this.corners = [];
        this.refusal = null;
        this.track.invalidateUI();
    }

    /** A point rounded to whole world units, as the track codes write them. */
    private static round(point: Vector): Vector {
        // Without -0, e.g. a tiny negative coordinate rounded
        return new Vector(Math.round(point.x) || 0, Math.round(point.y) || 0);
    }
}
