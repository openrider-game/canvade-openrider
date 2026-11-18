import { type CellView, GlProgram, type InstanceBuffer } from './gl-program';
import { ATLAS_SIZE, ATLAS_SLOT, ATLAS_ZOOM, type ItemAtlas, STAMP_HALF } from './item-atlas';

/** Items: a quad per item, textured with its look, turned by its rotation. */
const SPRITE_VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 sprite;
uniform vec2 offset;
uniform vec2 viewport;
uniform float zoom;
uniform float halfSize;
uniform float atlasSize;
uniform float slot;
uniform float stampHalf;
out vec2 uv;
void main() {
    vec2 c = corner * halfSize;
    float s = sin(sprite.z);
    float k = cos(sprite.z);
    vec2 turned = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
    vec2 position = sprite.xy * zoom + offset + turned;
    float perRow = atlasSize / slot;
    vec2 cell = vec2(mod(sprite.w, perRow), floor(sprite.w / perRow));
    uv = (cell * slot + slot * 0.5 + corner * stampHalf) / atlasSize;
    vec2 clip = position / viewport * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SPRITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D atlas;
out vec4 fragment;
void main() {
    fragment = texture(atlas, uv);
}`;

/** Draws the item sprites of the cells, each the image of its look in the {@link ItemAtlas}. */
export class SpriteProgram extends GlProgram {
    public constructor(gl: WebGL2RenderingContext) {
        super(gl, SPRITE_VERTEX, SPRITE_FRAGMENT);
        gl.useProgram(this.program);
        gl.uniform1f(this.uniform('atlasSize'), ATLAS_SIZE);
        gl.uniform1f(this.uniform('slot'), ATLAS_SLOT);
        gl.uniform1f(this.uniform('stampHalf'), STAMP_HALF);
        gl.uniform1i(this.uniform('atlas'), 0);
    }

    /** Draws the sprites of a cell, with the looks of the atlas. */
    public draw(sprites: InstanceBuffer | null, view: CellView, atlas: ItemAtlas): void {
        if (!sprites) {
            return;
        }
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform2f(this.uniform('offset'), view.offsetX, view.offsetY);
        gl.uniform2f(this.uniform('viewport'), view.width, view.height);
        gl.uniform1f(this.uniform('zoom'), view.zoom);
        gl.uniform1f(this.uniform('halfSize'), (STAMP_HALF / ATLAS_ZOOM) * view.zoom);
        atlas.bind();
        gl.bindVertexArray(sprites.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sprites.count);
    }
}
