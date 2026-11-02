import { UI_FONT_FAMILY } from 'canvade';

/** Context measuring the texts, null without canvas, e.g. in the tests. */
let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * Width of a text drawn with the font of the canvade UI at a size, in UI pixels: measured on a
 * canvas, or estimated without one, e.g. to lay out the panels before they are drawn.
 */
export function measureText(text: string, fontSize: number): number {
    if (measureContext === undefined) {
        measureContext =
            typeof document === 'undefined'
                ? null
                : (document.createElement('canvas').getContext?.('2d') ?? null);
    }
    if (measureContext) {
        measureContext.font = `${fontSize}px ${UI_FONT_FAMILY}`;
        const width = measureContext.measureText(text)?.width;
        if (typeof width === 'number') {
            return width;
        }
    }
    return text.length * fontSize * 0.55;
}

/** A text cut with an ellipsis to fit a width, as it is when it fits. */
export function fitText(text: string, width: number, fontSize: number): string {
    if (measureText(text, fontSize) <= width) {
        return text;
    }
    let length = text.length;
    while (length > 0 && measureText(`${text.slice(0, length)}…`, fontSize) > width) {
        length--;
    }
    return `${text.slice(0, length).trimEnd()}…`;
}
