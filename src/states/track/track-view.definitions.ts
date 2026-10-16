import { UIHorizontalAlign, UIVerticalAlign } from 'canvade';
import { ToolbarEntries } from '../../openrider/tool/toolbar.constants';

/** Edge of the canvas a toolbar is aligned on. */
export type ToolbarSide = 'left' | 'right';

/** Toolbar of a track view state, its tools stacked from the top of the canvas. */
export interface ToolbarDefinition {
    side: ToolbarSide;
    /** Classes of the tools, `null` entries leaving an empty slot. */
    tools: ToolbarEntries;
}

/** Text button of the interface, positioned from the aligned edges of the canvas. */
export interface ButtonDefinition {
    label: string;
    /** Offset from the horizontally aligned edge, in canvas pixels. */
    x: number;
    /** Offset from the vertically aligned edge, in canvas pixels. */
    y: number;
    width: number;
    height: number;
    /** Edge the button is aligned on horizontally, `left` by default. */
    horizontalAlign?: UIHorizontalAlign;
    /** Edge the button is aligned on vertically, `top` by default. */
    verticalAlign?: UIVerticalAlign;
    /** Called when the button is clicked. */
    action(): void;
}
