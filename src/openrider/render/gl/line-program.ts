import { SCENERY_STROKE_STYLES } from '../../item/line/scenery-colors';
import { type CellView, GlProgram, type InstanceBuffer } from './gl-program';

/** Lines: a quad per segment, a capsule cut by its distance to the segment. */
const LINE_VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 segment;
layout(location = 2) in float colorIndex;
uniform vec2 offset;
uniform vec2 viewport;
uniform float zoom;
uniform float halfWidth;
uniform vec4 palette[16];
uniform vec4 solid;
uniform bool scenery;
out vec2 position;
out vec2 start;
out vec2 end;
out vec4 color;
void main() {
    start = segment.xy * zoom + offset;
    end = segment.zw * zoom + offset;
    vec2 along = end - start;
    float len = length(along);
    vec2 direction = len > 0.0 ? along / len : vec2(1.0, 0.0);
    vec2 normal = vec2(-direction.y, direction.x);
    // A pixel more than the half width, for the smoothed edge
    float reach = halfWidth + 1.0;
    position = (corner.x < 0.0 ? start - direction * reach : end + direction * reach)
        + normal * corner.y * reach;
    color = scenery ? palette[int(colorIndex)] : solid;
    vec2 clip = position / viewport * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 position;
in vec2 start;
in vec2 end;
in vec4 color;
uniform float halfWidth;
out vec4 fragment;
void main() {
    vec2 along = end - start;
    float lengthSquared = dot(along, along);
    float t = lengthSquared > 0.0 ? clamp(dot(position - start, along) / lengthSquared, 0.0, 1.0) : 0.0;
    float distance = length(position - (start + along * t));
    // Coverage of the pixel: round caps, smoothed over a pixel as the canvas strokes them
    float coverage = clamp(halfWidth + 0.5 - distance, 0.0, 1.0);
    fragment = color * coverage;
}`;

/**
 * Draws the lines of the cells: the scenery in the colors of `SCENERY_STROKE_STYLES`, the solid
 * lines in black, as wide as the canvas strokes them, with round caps.
 */
export class LineProgram extends GlProgram {
    public constructor(gl: WebGL2RenderingContext) {
        super(gl, LINE_VERTEX, LINE_FRAGMENT);
        gl.useProgram(this.program);
        const palette = SCENERY_STROKE_STYLES.flatMap((color) => LineProgram.rgba(color));
        gl.uniform4fv(this.uniform('palette[0]'), new Float32Array(palette));
        gl.uniform4f(this.uniform('solid'), 0, 0, 0, 1);
    }

    /** Uses the program for the lines of a cell. */
    public use(view: CellView): void {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform2f(this.uniform('offset'), view.offsetX, view.offsetY);
        gl.uniform2f(this.uniform('viewport'), view.width, view.height);
        gl.uniform1f(this.uniform('zoom'), view.zoom);
        // As wide as the canvas strokes them, see `createPainter`
        gl.uniform1f(this.uniform('halfWidth'), Math.max(2 * view.zoom, 0.5) / 2);
    }

    /**
     * Draws lines of a cell, after {@link LineProgram.use}.
     *
     * @param scenery - Whether they are scenery lines, each in its color, else solid lines.
     */
    public draw(lines: InstanceBuffer | null, scenery: boolean): void {
        if (!lines) {
            return;
        }
        const gl = this.gl;
        gl.uniform1i(this.uniform('scenery'), scenery ? 1 : 0);
        gl.bindVertexArray(lines.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lines.count);
    }

    /** A color of the form `#rgb` or `#rrggbb` as floats, opaque. */
    private static rgba(color: string): [number, number, number, number] {
        const hex =
            color.length === 4
                ? color
                      .slice(1)
                      .split('')
                      .map((digit) => digit + digit)
                      .join('')
                : color.slice(1, 7);
        const value = parseInt(hex, 16);
        return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
    }
}
