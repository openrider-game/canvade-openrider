import { Control, KEYF } from 'canvade';
import { Tool } from '../tool';

/** Fullscreen API, prefixed in older Safari versions. */
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};

/** Styles of the element hosting the game when it fills the page, without the Fullscreen API. */
const PAGE_FILLING_STYLES: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    'max-width': 'none',
    'max-height': 'none',
    margin: '0',
    border: '0',
    'z-index': '1000',
};

/**
 * Toggles the fullscreen mode on the element hosting the game canvas.
 *
 * Where the browser has no Fullscreen API for the elements of a page, as on the iPhone, the
 * element fills the page instead, over the rest of it.
 */
export class FullscreenTool extends Tool {
    public static override readonly toolName: string = 'Toggle Fullscreen';
    public static override readonly keyLabel: string = 'F';
    public static override readonly key = new Control(KEYF);
    public static override readonly icon = 'expand';

    /** Styles of the host element before it filled the page, null while it does not. */
    private pageFillingBefore: string | null = null;

    public override run(): void {
        const host = this.track.canvas?.parentElement as FullscreenElement | null | undefined;
        const doc = document as FullscreenDocument;
        if (!host) {
            return;
        }

        if (this.pageFillingBefore !== null) {
            this.fillPage(host, false);
        } else if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
            void (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
        } else if (host.requestFullscreen) {
            void host.requestFullscreen();
        } else if (host.webkitRequestFullscreen) {
            void host.webkitRequestFullscreen();
        } else {
            this.fillPage(host, true);
        }
    }

    /** Makes the host element fill the page or gives it its styles back, resizing the canvas. */
    private fillPage(host: HTMLElement, fill: boolean): void {
        if (fill) {
            this.pageFillingBefore = host.style.cssText;
            for (const [name, value] of Object.entries(PAGE_FILLING_STYLES)) {
                host.style.setProperty(name, value, 'important');
            }
        } else {
            host.style.cssText = this.pageFillingBefore ?? '';
            this.pageFillingBefore = null;
        }
        // The game sizes its canvas after the host element on resize
        window.dispatchEvent(new Event('resize'));
    }
}
