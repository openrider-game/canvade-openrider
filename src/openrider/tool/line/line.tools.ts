import { Control, KEYA, KEYQ, KEYS, KEYW } from 'canvade';
import { LineClass } from '../../item/line/line';
import { SceneryLine } from '../../item/line/scenery-line';
import { SolidLine } from '../../item/line/solid-line';
import {
    SCENERY_BRUSH_IMAGE,
    SCENERY_LINE_IMAGE,
    SOLID_BRUSH_IMAGE,
    SOLID_LINE_IMAGE,
} from '../tool.constants';
import { BrushTool } from './brush.tool';
import { LineTool } from './line.tool';

/** Draws solid lines, on which the bikes ride. */
export class SolidLineTool extends LineTool {
    public static override readonly toolName: string = 'Solid Line';
    public static override readonly key = new Control(KEYQ);
    public static override readonly icon = SOLID_LINE_IMAGE;

    protected get lineClass(): LineClass {
        return SolidLine;
    }
}

/** Draws scenery lines, only decorative. */
export class SceneryLineTool extends LineTool {
    public static override readonly toolName: string = 'Scenery Line';
    public static override readonly key = new Control(KEYW);
    public static override readonly icon = SCENERY_LINE_IMAGE;

    protected get lineClass(): LineClass {
        return SceneryLine;
    }
}

/** Draws solid lines with a brush. */
export class SolidBrushTool extends BrushTool {
    public static override readonly toolName: string = 'Solid Brush';
    public static override readonly key = new Control(KEYA);
    public static override readonly icon = SOLID_BRUSH_IMAGE;

    protected get lineClass(): LineClass {
        return SolidLine;
    }
}

/** Draws scenery lines with a brush. */
export class SceneryBrushTool extends BrushTool {
    public static override readonly toolName: string = 'Scenery Brush';
    public static override readonly key = new Control(KEYS);
    public static override readonly icon = SCENERY_BRUSH_IMAGE;

    protected get lineClass(): LineClass {
        return SceneryLine;
    }
}
