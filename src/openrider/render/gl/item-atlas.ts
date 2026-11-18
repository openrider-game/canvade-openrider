import { painter } from '../painter';

/** Size of the texture of the item looks, in pixels. */
export const ATLAS_SIZE = 2048,
    /** Square of each item look in the texture, in pixels. */
    ATLAS_SLOT = 128,
    /** Item looks the texture holds. */
    ATLAS_LOOKS = (ATLAS_SIZE / ATLAS_SLOT) ** 2,
    /** Zoom the item looks are drawn at in the texture, scaled down by the GPU. */
    ATLAS_ZOOM = 4,
    /**
     * Half the size of the image of an item at {@link ATLAS_ZOOM}, as the painter stamps it (see
     * `createPainter`): its farthest corners, its outline and a pixel of margin.
     */
    STAMP_HALF = Math.ceil(12.3 * ATLAS_ZOOM + Math.max(2 * ATLAS_ZOOM, 0.5)) + 1;

/**
 * Texture of the looks of the items, a shape in a color each, drawn by the painter as the canvas
 * draws them, unturned: the sprites are turned by the GPU.
 */
export class ItemAtlas {
    public texture!: WebGLTexture;
    /** Canvas the looks are drawn on, uploaded to {@link ItemAtlas.texture}. */
    private readonly canvas: HTMLCanvasElement;
    private readonly looks = new Map<string, number>();
    private changed = false;

    public constructor(private readonly gl: WebGL2RenderingContext) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = ATLAS_SIZE;
        this.canvas.height = ATLAS_SIZE;
        this.createTexture();
    }

    /** Creates the texture again, the looks drawn so far uploaded, e.g. once the context is back. */
    public createTexture(): void {
        const gl = this.gl;
        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.changed = true;
    }

    /** Index of the look of an item, drawn the first time. */
    public look(shape: number, color: string): number {
        const key = `${shape} ${color}`;
        let index = this.looks.get(key);
        if (index === undefined) {
            // A full atlas draws the new looks over the first ones: hundreds of looks never happen
            index = this.looks.size % ATLAS_LOOKS;
            this.looks.set(key, index);
            const perRow = ATLAS_SIZE / ATLAS_SLOT;
            const ctx = this.canvas.getContext('2d')!;
            const left = (index % perRow) * ATLAS_SLOT;
            const top = Math.floor(index / perRow) * ATLAS_SLOT;
            ctx.clearRect(left, top, ATLAS_SLOT, ATLAS_SLOT);
            painter.drawItem(
                ctx,
                shape,
                color,
                left + ATLAS_SLOT / 2,
                top + ATLAS_SLOT / 2,
                0,
                ATLAS_ZOOM,
            );
            this.changed = true;
        }
        return index;
    }

    /** Uploads the looks drawn since, then binds the texture to the first unit. */
    public bind(): void {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (this.changed) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
            gl.generateMipmap(gl.TEXTURE_2D);
            this.changed = false;
        }
    }
}
