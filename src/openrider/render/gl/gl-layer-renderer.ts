import type { RenderCell } from '../../grid/cell/render-cell';
import type { Track } from '../../track/track';
import type { TrackLayer } from '../../track/track-layer';
import { CellBuffers } from './cell-buffers';
import type { CellView } from './gl-program';
import { ItemAtlas } from './item-atlas';
import { LineProgram } from './line-program';
import { SpriteProgram } from './sprite-program';

/**
 * Draws the lines and the item sprites of the layers with WebGL2, rather than the cached images
 * of their cells: the lines are segments in buffers of the GPU, positioned from their cell (see
 * {@link CellBuffers} and {@link LineProgram}), the items images of an atlas (see
 * {@link ItemAtlas} and {@link SpriteProgram}). The zoom being a parameter of the shaders,
 * zooming draws nothing again, and an edited cell only fills its buffers again.
 *
 * A layer is drawn on a canvas of its own, then copied once onto the canvas of the game at the
 * opacity of the layer, as the cell images were: the main layers under the bikes, the foreground
 * layers over them, each translucent layer seen through as a whole. The rest of the track, e.g.
 * the items drawn on every frame, the reached items and the command blocks, are still drawn by the
 * canvas.
 *
 * Positions are sent relative to their cell, in 32 bits, and the cells relative to the camera:
 * the large coordinates of the tracks keep their precision.
 */
export class GlLayerRenderer {
    private static instance: GlLayerRenderer | null | undefined;

    private lines: LineProgram;
    private sprites: SpriteProgram;
    private readonly atlas: ItemAtlas;
    private readonly cells: CellBuffers;
    private lost = false;

    private constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly gl: WebGL2RenderingContext,
    ) {
        this.lines = new LineProgram(gl);
        this.sprites = new SpriteProgram(gl);
        this.atlas = new ItemAtlas(gl);
        this.cells = new CellBuffers(gl, this.atlas);
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.lost = true;
        });
        // Everything on the GPU made again: the programs, the atlas, the buffers of the cells
        canvas.addEventListener('webglcontextrestored', () => {
            this.lines = new LineProgram(gl);
            this.sprites = new SpriteProgram(gl);
            this.atlas.createTexture();
            this.cells.reset();
            this.lost = false;
        });
    }

    /**
     * The renderer of the page, created on first use: null without WebGL2, e.g. in the tests, the
     * cells then drawing their images.
     */
    public static get(): GlLayerRenderer | null {
        if (GlLayerRenderer.instance === undefined) {
            GlLayerRenderer.instance = GlLayerRenderer.create();
        }
        return GlLayerRenderer.instance;
    }

    private static create(): GlLayerRenderer | null {
        if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') {
            return null;
        }
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2', {
                alpha: true,
                antialias: false,
                premultipliedAlpha: true,
                depth: false,
                stencil: false,
            });
            return gl ? new GlLayerRenderer(canvas, gl) : null;
        } catch {
            return null;
        }
    }

    /**
     * Draws the lines and the item sprites of the cells of a layer in view onto a canvas, at the
     * opacity of the layer.
     *
     * @param cells - The cells of the layer in view, in the order the canvas draws them.
     * @returns Whether it was drawn: false while the context of the GPU is lost, the cells then
     * drawing their images.
     */
    public drawLayer(
        ctx: CanvasRenderingContext2D,
        track: Track,
        layer: TrackLayer,
        cells: readonly RenderCell[],
    ): boolean {
        const gl = this.gl;
        if (this.lost || gl.isContextLost()) {
            return false;
        }
        const { width, height } = ctx.canvas;
        this.clear(width, height);

        this.cells.nextFrame();
        const zoom = track.zoomFactor;
        for (const cell of cells) {
            const entry = this.cells.entry(cell);
            if (!entry.scenery && !entry.solid && !entry.sprites) {
                continue;
            }
            // In 64 bits here: the cell from the camera, its lines from the cell
            const view: CellView = {
                width,
                height,
                zoom,
                offsetX: (cell.x - track.camera.x) * zoom + track.viewWidth / 2,
                offsetY: (cell.y - track.camera.y) * zoom + track.viewHeight / 2,
            };
            // The scenery, the solid lines, then the sprites, as the canvas draws a cell
            if (entry.scenery || entry.solid) {
                this.lines.use(view);
                this.lines.draw(entry.scenery, true);
                this.lines.draw(entry.solid, false);
            }
            this.sprites.draw(entry.sprites, view, this.atlas);
        }
        gl.bindVertexArray(null);
        this.cells.evict();

        ctx.save();
        ctx.globalAlpha = layer.opacityFactor;
        ctx.drawImage(this.canvas, 0, 0);
        ctx.restore();
        return true;
    }

    /** Sizes the canvas of the layers as the one drawn on, cleared and ready to blend. */
    private clear(width: number, height: number): void {
        const gl = this.gl;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        // Premultiplied colors, as the canvas composites them
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
}
