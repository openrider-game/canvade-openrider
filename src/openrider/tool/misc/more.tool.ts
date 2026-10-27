import type { Track } from '../../track/track';
import { Tool } from '../tool';

/**
 * Last button of a toolbar too long for the canvas on touch screens, opening or closing the tools
 * that do not fit, next to it. Created by the interface, not by the toolbar definitions.
 */
export class MoreTool extends Tool {
    public static override readonly toolName: string = 'More';
    public static override readonly icon = 'more';

    /**
     * @param toggle - Opens or closes the tools that do not fit.
     * @param isOpen - Whether they are displayed.
     */
    public constructor(
        track: Track,
        private readonly toggle: () => void,
        private readonly isOpen: () => boolean,
    ) {
        super(track);
    }

    public override run(): void {
        this.toggle();
    }

    public override isToggled(): boolean {
        return this.isOpen();
    }
}
