import { Vector } from 'canvade';

/** Patterns filling an area: parallel lines, or parallel lines crossed by perpendicular ones. */
export type HatchPattern = 'parallel' | 'cross';

export interface HatchOptions {
    /** Angle of the lines, in degrees, 0 for horizontal ones, turning clockwise on screen. */
    angle: number;
    /** Distance between two lines, in world units. */
    spacing: number;
    pattern: HatchPattern;
    /** Most segments made: past it, the hatch stops and tells it overflowed. */
    maxSegments: number;
}

/** A hatch line, from one side of the area to the other. */
export type HatchSegment = [Vector, Vector];

export interface HatchResult {
    segments: HatchSegment[];
    /** Whether the area needs more than `maxSegments` segments, `segments` being then empty. */
    overflow: boolean;
}

/**
 * Fills a polygon with lines: the parts inside it of parallel lines, `spacing` apart, at an angle.
 *
 * Scans the polygon turned so that the lines are horizontal: each line crosses its edges at
 * points, sorted along it, and lies inside between the first and second crossing, the third and
 * fourth, and so on (the even-odd rule). Concave polygons, and polygons crossing themselves, are
 * filled the same way, a part crossed twice being outside.
 *
 * The lines are at whole multiples of the spacing from the origin of the world, perpendicularly to
 * them: the hatches of two areas side by side line up.
 *
 * @param polygon - Points of the area in order, at least 3, closed from the last to the first.
 */
export function hatch(polygon: readonly Vector[], options: HatchOptions): HatchResult {
    const angles =
        options.pattern === 'cross' ? [options.angle, options.angle + 90] : [options.angle];
    const segments: HatchSegment[] = [];
    for (const angle of angles) {
        const remaining = options.maxSegments - segments.length;
        const pass = hatchPass(polygon, angle, options.spacing, remaining);
        if (pass === null) {
            return { segments: [], overflow: true };
        }
        segments.push(...pass);
    }
    return { segments, overflow: false };
}

/** The segments of one direction, null when more than `max`. */
function hatchPass(
    polygon: readonly Vector[],
    angle: number,
    spacing: number,
    max: number,
): HatchSegment[] | null {
    if (polygon.length < 3 || !(spacing > 0)) {
        return [];
    }
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // Turned by -angle: the lines become horizontal
    const turned = polygon.map((p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }));
    const ys = turned.map((p) => p.y);
    const first = Math.ceil(Math.min(...ys) / spacing);
    const last = Math.floor(Math.max(...ys) / spacing);
    // More rows than segments allowed: each row makes one at least, but for the two on the
    // highest and lowest points, which may touch the area without entering it
    if (last - first + 1 > max + 2) {
        return null;
    }

    const segments: HatchSegment[] = [];
    for (let row = first; row <= last; row++) {
        const y = row * spacing;
        const crossings: number[] = [];
        for (let i = 0; i < turned.length; i++) {
            const a = turned[i];
            const b = turned[(i + 1) % turned.length];
            // Half-open, so that a vertex on the line counts once, and a horizontal edge never
            if (a.y <= y !== b.y <= y) {
                crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
            }
        }
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2) {
            if (onEdge(turned, y, (crossings[i] + crossings[i + 1]) / 2)) {
                continue;
            }
            if (segments.length === max) {
                return null;
            }
            // Turned back by the angle
            const back = (x: number) => new Vector(x * cos - y * sin, x * sin + y * cos);
            segments.push([back(crossings[i]), back(crossings[i + 1])]);
        }
    }
    return segments;
}

/**
 * Whether a point of a line lies on an edge of the area along the line: such a line is its outline,
 * not inside it. Without this, the half-open rule would keep the lines on the edges on one side of
 * an area only, e.g. its top edge but not its bottom one, the side changing with the angle.
 */
function onEdge(turned: readonly { x: number; y: number }[], y: number, x: number): boolean {
    // Turned corners at whole units come back off by rounding errors
    const epsilon = 1e-9 * Math.max(1, Math.abs(y), Math.abs(x));
    for (let i = 0; i < turned.length; i++) {
        const a = turned[i];
        const b = turned[(i + 1) % turned.length];
        if (
            Math.abs(a.y - y) <= epsilon &&
            Math.abs(b.y - y) <= epsilon &&
            x >= Math.min(a.x, b.x) - epsilon &&
            x <= Math.max(a.x, b.x) + epsilon
        ) {
            return true;
        }
    }
    return false;
}
