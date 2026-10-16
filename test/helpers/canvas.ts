import { vi } from 'vitest';

/** Canvas element double, its context recording every drawing call. */
export interface CanvasMock {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    /** Names of the context methods called, in order. */
    calls: string[];
}

/**
 * Creates a canvas double: every context method is a spy, `measureText` returns sizes
 * proportional to the text length, and the context properties keep the values written to them.
 */
export function createCanvasMock(width = 700, height = 400): CanvasMock {
    const calls: string[] = [];
    const style: Record<string, string> = {};
    const canvas = { width, height, style, parentElement: null } as unknown as HTMLCanvasElement;

    const methods = new Map<PropertyKey, unknown>();
    const values: Record<PropertyKey, unknown> = { canvas };
    const context = new Proxy(values, {
        get(target, property) {
            if (property in target) {
                return target[property];
            }

            let method = methods.get(property);
            if (!method) {
                method =
                    property === 'measureText'
                        ? (text: string) => ({
                              width: String(text).length * 7,
                              actualBoundingBoxAscent: 8,
                              actualBoundingBoxDescent: 2,
                          })
                        : vi.fn(() => calls.push(String(property)));
                methods.set(property, method);
            }
            return method;
        },
        set(target, property, value) {
            target[property] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;

    Object.assign(canvas, {
        getContext: () => context,
        transferControlToOffscreen: vi.fn(),
    });

    return { canvas, context, calls };
}

/**
 * Stubs the globals of the browser used by the game: `document` creating canvas doubles and
 * receiving the keyboard events, and the image loading of the tool icons.
 */
export function stubBrowser(): { dispatchEvent: ReturnType<typeof vi.fn> } {
    const dispatchEvent = vi.fn();

    vi.stubGlobal('document', {
        hidden: false,
        dispatchEvent,
        createElement: (tag: string) =>
            tag === 'canvas'
                ? createCanvasMock(0, 0).canvas
                : { addEventListener: vi.fn(), click: vi.fn() },
    });
    vi.stubGlobal(
        'Image',
        class {
            public src = '';
            public addEventListener = vi.fn();
        },
    );

    return { dispatchEvent };
}
