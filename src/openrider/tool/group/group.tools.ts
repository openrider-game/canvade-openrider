import { Control, KEYI, KEYJ } from 'canvade';
import type { Track } from '../../track/track';
import {
    BombTool,
    BoostTool,
    CheckpointTool,
    GravityTool,
    LinkedCheckpointTool,
    SlowMoTool,
    TargetTool,
    TeleporterTool,
} from '../item/item.tools';
import {
    EngineOffTool,
    InvincibilityTool,
    NoSteerTool,
    ResetTool,
    SlipperyTool,
    ZeroGravityTool,
} from '../item/status.tools';
import { TARGET_IMAGE } from '../tool.constants';
import { ToolGroupTool } from './tool-group.tool';

/** Group of the item tools. */
export class ItemGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Item Group';
    public static override readonly keyLabel: string = 'I';
    public static override readonly key = new Control(KEYI);
    public static override readonly icon = TARGET_IMAGE;

    public constructor(track: Track) {
        super(track, [
            TargetTool,
            CheckpointTool,
            LinkedCheckpointTool,
            BoostTool,
            GravityTool,
            BombTool,
            SlowMoTool,
            TeleporterTool,
        ]);
    }
}

/** Group of the status effect tools. */
export class StatusGroupTool extends ToolGroupTool {
    public static override readonly toolName: string = 'Status Effect Group';
    public static override readonly keyLabel: string = 'J';
    public static override readonly key = new Control(KEYJ);
    public static override readonly icon = TARGET_IMAGE;

    public constructor(track: Track) {
        super(track, [
            ResetTool,
            InvincibilityTool,
            SlipperyTool,
            NoSteerTool,
            EngineOffTool,
            ZeroGravityTool,
        ]);
    }
}
