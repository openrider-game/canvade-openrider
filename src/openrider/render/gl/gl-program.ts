/**
 * Shader program of WebGL2, compiled from its sources, with the locations of its uniforms looked
 * up once.
 */
export class GlProgram {
    public readonly program: WebGLProgram;
    private readonly locations = new Map<string, WebGLUniformLocation | null>();

    /** @throws When a shader does not compile or the program does not link. */
    public constructor(
        protected readonly gl: WebGL2RenderingContext,
        vertex: string,
        fragment: string,
    ) {
        const program = gl.createProgram()!;
        for (const [type, source] of [
            [gl.VERTEX_SHADER, vertex],
            [gl.FRAGMENT_SHADER, fragment],
        ] as const) {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`Shader not compiled: ${gl.getShaderInfoLog(shader)}`);
            }
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Program not linked: ${gl.getProgramInfoLog(program)}`);
        }
        this.program = program;
    }

    /** Location of a uniform, looked up once. */
    protected uniform(name: string): WebGLUniformLocation | null {
        if (!this.locations.has(name)) {
            this.locations.set(name, this.gl.getUniformLocation(this.program, name));
        }
        return this.locations.get(name)!;
    }
}

/** Where the instances of a cell are drawn, in canvas pixels. */
export interface CellView {
    /** Size of the canvas. */
    width: number;
    height: number;
    zoom: number;
    /** Position of the cell on the canvas, its lines and items being relative to it. */
    offsetX: number;
    offsetY: number;
}

/** Instances of a kind of a cell on the GPU, see `CellBuffers`. */
export interface InstanceBuffer {
    vao: WebGLVertexArrayObject;
    buffer: WebGLBuffer;
    count: number;
}
