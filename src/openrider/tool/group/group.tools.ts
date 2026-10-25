import { Control, KEYD, KEYI, KEYJ, KEYO } from 'canvade';
import type { Track } from '../../track/track';
import {
    BombTool,
    BoostTool,
    CheckpointTool,
    GravityTool,
    LauncherTool,
    LinkedCheckpointTool,
    MudTool,
    SlowMoTool,
    TargetTool,
    TeleporterTool,
} from '../item/item.tools';
import { CommandBlockTool } from '../item/command-block.tool';
import {
    EngineOffTool,
    HeavyTool,
    InvincibilityTool,
    LowGravityTool,
    MirrorTool,
    NoSteerTool,
    ResetTool,
    SlipperyTool,
    TurboTool,
    ZeroGravityTool,
} from '../item/status.tools';
import { BrushTool } from '../line/brush.tool';
import { LineTool } from '../line/line.tool';
import { CircleTool, CurveTool } from '../shape/shape.tools';
import type { ToolClass } from '../tool';
import { SOLID_BRUSH_IMAGE, TARGET_IMAGE } from '../tool.constants';
import { ToolGroupTool } from './tool-group.tool';

/** Group of the item tools. */
export class ItemGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Item Group';
    public static override readonly key = new Control(KEYI);
    public static override readonly icon = TARGET_IMAGE;
    /** Tools of the group, in display order. */
    public static readonly toolClasses: ToolClass[] = [
        TargetTool,
        CheckpointTool,
        LinkedCheckpointTool,
        BoostTool,
        GravityTool,
        BombTool,
        SlowMoTool,
        TeleporterTool,
        LauncherTool,
        MudTool,
        CommandBlockTool,
    ];

    public constructor(track: Track) {
        super(track, ItemGroupTool.toolClasses);
    }
}

/** Group of the status effect tools. */
export class StatusGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Status Effect Group';
    public static override readonly key = new Control(KEYJ);
    public static override readonly icon = TARGET_IMAGE;
    /** Tools of the group, in display order. */
    public static readonly toolClasses: ToolClass[] = [
        ResetTool,
        InvincibilityTool,
        SlipperyTool,
        NoSteerTool,
        EngineOffTool,
        ZeroGravityTool,
        HeavyTool,
        LowGravityTool,
        MirrorTool,
        TurboTool,
    ];

    public constructor(track: Track) {
        super(track, StatusGroupTool.toolClasses);
    }
}

/** Group of the shape tools, drawing curves and circles of lines. */
export class ShapeGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Shape Group';
    public static override readonly key = new Control(KEYO);
    public static override readonly icon = 'curve';
    /** Tools of the group, in display order. */
    public static readonly toolClasses: ToolClass[] = [CurveTool, CircleTool];

    public constructor(track: Track) {
        super(track, ShapeGroupTool.toolClasses);
    }
}

/** Group of the line tools: the brush and the straight line, solid or scenery. */
export class LineGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Line Group';
    public static override readonly key = new Control(KEYD);
    public static override readonly icon = SOLID_BRUSH_IMAGE;
    /** Tools of the group, in display order. */
    public static readonly toolClasses: ToolClass[] = [BrushTool, LineTool];

    public constructor(track: Track) {
        super(track, LineGroupTool.toolClasses);
    }
}
