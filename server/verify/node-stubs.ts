/**
 * Minimal browser globals for running the game physics in Node: the tracks create canvases to
 * draw on, and the tool icons create images, neither of which is used without a display.
 *
 * Imported first by the command line entry, before the game modules.
 */

/** Canvas double, whose context ignores every drawing call. */
function createCanvas(): unknown {
    const context: object = new Proxy(
        {},
        {
            get: (target: Record<PropertyKey, unknown>, property) =>
                property in target ? target[property] : () => ({ width: 0 }),
            set: (target: Record<PropertyKey, unknown>, property, value) => {
                target[property] = value;
                return true;
            },
        },
    );

    return { width: 0, height: 0, style: {}, getContext: () => context };
}

const scope = globalThis as Record<string, unknown>;

scope.document ??= {
    hidden: true,
    dispatchEvent: () => true,
    addEventListener: () => {},
    createElement: (tag: string) =>
        tag === 'canvas' ? createCanvas() : { addEventListener: () => {}, style: {} },
};
scope.Image ??= class {
    public src = '';
    public addEventListener(): void {}
};
