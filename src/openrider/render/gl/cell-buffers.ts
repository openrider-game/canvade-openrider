import type { RenderCell } from '../../grid/cell/render-cell';
import type { InstanceBuffer } from './gl-program';
import type { ItemAtlas } from './item-atlas';

/** Memory of the buffers of the cells on the GPU, past which the least recently drawn go. */
const GPU_BUDGET = 192 * 1024 * 1024;

/** What a cell draws on the GPU, for a version of its content. */
export interface CellEntry {
    version: number;
    scenery: InstanceBuffer | null;
    solid: InstanceBuffer | null;
    sprites: InstanceBuffer | null;
    bytes: number;
    /** Frame the cell was last drawn at. */
    drawnAt: number;
}

/**
 * Buffers of the render cells on the GPU: their lines and item sprites, positioned from the cell
 * in 32 bits, filled again once the content of a cell changes, and freed for the cells drawn
 * least recently past {@link GPU_BUDGET}.
 */
export class CellBuffers {
    /** Corners of the quad every instance is drawn as, shared by the buffers. */
    private quad: WebGLBuffer;
    private readonly cells = new Map<RenderCell, CellEntry>();
    private bytes = 0;
    private frame = 0;

    public constructor(
        private readonly gl: WebGL2RenderingContext,
        private readonly atlas: ItemAtlas,
    ) {
        this.quad = this.createQuad();
    }

    /** Forgets every buffer, e.g. once the context is lost, and creates the quad again. */
    public reset(): void {
        this.cells.clear();
        this.bytes = 0;
        this.quad = this.createQuad();
    }

    /** Starts a frame: the cells asked for meanwhile are kept by {@link CellBuffers.evict}. */
    public nextFrame(): void {
        this.frame++;
    }

    /** What a cell draws, its buffers filled again once its content changed. */
    public entry(cell: RenderCell): CellEntry {
        const version = cell.contentVersion;
        let entry = this.cells.get(cell);
        if (entry && entry.version !== version) {
            this.release(cell, entry);
            entry = undefined;
        }
        if (!entry) {
            entry = this.fill(cell, version);
            this.cells.set(cell, entry);
            this.bytes += entry.bytes;
        }
        entry.drawnAt = this.frame;
        return entry;
    }

    /** Frees the buffers of the cells drawn least recently, past {@link GPU_BUDGET}. */
    public evict(): void {
        if (this.bytes <= GPU_BUDGET) {
            return;
        }
        const entries = [...this.cells].sort((a, b) => a[1].drawnAt - b[1].drawnAt);
        for (const [cell, entry] of entries) {
            if (this.bytes <= GPU_BUDGET || entry.drawnAt === this.frame) {
                break;
            }
            this.release(cell, entry);
        }
    }

    /** Fills the buffers of a cell from its lines and sprites, positioned from the cell. */
    private fill(cell: RenderCell, version: number): CellEntry {
        const drawing = cell.drawing(1, 1);
        const { x, y } = cell;

        // Scenery: x1, y1, x2, y2, color, sorted by color as the canvas strokes them
        const scenery = new Float32Array(drawing.scenery.length);
        for (let i = 0; i < drawing.scenery.length; i += 5) {
            scenery[i] = drawing.scenery[i] - x;
            scenery[i + 1] = drawing.scenery[i + 1] - y;
            scenery[i + 2] = drawing.scenery[i + 2] - x;
            scenery[i + 3] = drawing.scenery[i + 3] - y;
            scenery[i + 4] = drawing.scenery[i + 4];
        }
        const solid = new Float32Array(drawing.lines.length);
        for (let i = 0; i < drawing.lines.length; i += 4) {
            solid[i] = drawing.lines[i] - x;
            solid[i + 1] = drawing.lines[i + 1] - y;
            solid[i + 2] = drawing.lines[i + 2] - x;
            solid[i + 3] = drawing.lines[i + 3] - y;
        }
        // Sprites: x, y, rotation, look in the atlas
        const count = drawing.sprites.length / 5;
        const sprites = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            const s = i * 5;
            sprites[i * 4] = drawing.sprites[s + 2] - x;
            sprites[i * 4 + 1] = drawing.sprites[s + 3] - y;
            sprites[i * 4 + 2] = drawing.sprites[s + 4];
            sprites[i * 4 + 3] = this.atlas.look(
                drawing.sprites[s],
                drawing.spriteColors[drawing.sprites[s + 1]],
            );
        }

        return {
            version,
            scenery: this.instances(scenery, 5),
            solid: this.instances(solid, 4),
            sprites: this.instances(sprites, 4),
            bytes: scenery.byteLength + solid.byteLength + sprites.byteLength,
            drawnAt: this.frame,
        };
    }

    /**
     * Instances on the GPU, sharing the quad of the corners: 4 floats each, the segment of a line
     * or the position, rotation and look of a sprite, then the color of a scenery line.
     *
     * @param stride - Floats per instance: 5 for the scenery lines, else 4.
     */
    private instances(data: Float32Array, stride: number): InstanceBuffer | null {
        if (!data.length) {
            return null;
        }
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const bytes = stride * 4;
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, bytes, 0);
        gl.vertexAttribDivisor(1, 1);
        if (stride === 5) {
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 1, gl.FLOAT, false, bytes, 16);
            gl.vertexAttribDivisor(2, 1);
        } else {
            gl.disableVertexAttribArray(2);
            gl.vertexAttrib1f(2, 0);
        }
        gl.bindVertexArray(null);
        return { vao, buffer, count: data.length / stride };
    }

    private release(cell: RenderCell, entry: CellEntry): void {
        const gl = this.gl;
        for (const instances of [entry.scenery, entry.solid, entry.sprites]) {
            if (instances) {
                gl.deleteVertexArray(instances.vao);
                gl.deleteBuffer(instances.buffer);
            }
        }
        this.bytes -= entry.bytes;
        this.cells.delete(cell);
    }

    private createQuad(): WebGLBuffer {
        const gl = this.gl;
        const quad = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
        );
        return quad;
    }
}
