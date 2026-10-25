import { ItemGroupTool, StatusGroupTool } from './group/group.tools';
import {
    SceneryBrushTool,
    SceneryLineTool,
    SolidBrushTool,
    SolidLineTool,
} from './line/line.tools';
import { CameraTool } from './misc/camera.tool';
import { CancelCheckpointTool } from './misc/cancel-checkpoint.tool';
import { EraserTool } from './misc/eraser.tool';
import { FocusGhostTool } from './misc/focus-ghost.tool';
import { FullscreenTool } from './misc/fullscreen.tool';
import { RedoTool, UndoTool } from './misc/history.tool';
import { NewTrackTool } from './misc/new-track.tool';
import { PauseTool } from './misc/pause.tool';
import { RestartTool } from './misc/restart.tool';
import { StartPositionTool } from './misc/start-position.tool';
import { SwitchBikeTool } from './misc/switch-bike.tool';
import { ToolClass } from './tool';
import { GridSnapTool, ToggleDebugTool } from './toggle/toggle.tools';

/** Toolbar entries, `null` leaving an empty space between buttons. */
export type ToolbarEntries = Array<ToolClass | null>;

/** Left toolbar while racing a track. */
export const LEFT_TOOLBAR_VIEWING: ToolbarEntries = [
        PauseTool,
        RestartTool,
        CancelCheckpointTool,
        null,
        SwitchBikeTool,
        FocusGhostTool,
        null,
        CameraTool,
        FullscreenTool,
    ],
    /** Left toolbar in the editor, adding the history buttons. */
    LEFT_TOOLBAR_EDITING: ToolbarEntries = [...LEFT_TOOLBAR_VIEWING, null, UndoTool, RedoTool],
    /** Right toolbar in the editor, with the drawing tools. */
    RIGHT_TOOLBAR: ToolbarEntries = [
        SolidBrushTool,
        SceneryBrushTool,
        SolidLineTool,
        SceneryLineTool,
        EraserTool,
        GridSnapTool,
        null,
        ItemGroupTool,
        StatusGroupTool,
        null,
        StartPositionTool,
        null,
        ToggleDebugTool,
    ],
    /** Toolbar of the track upload screen, where the track can only be looked around. */
    UPLOAD_TOOLBAR: ToolbarEntries = [CameraTool, FullscreenTool],
    /** Left toolbar in endurance mode: no checkpoints nor ghosts, but new tracks. */
    LEFT_TOOLBAR_ENDURANCE: ToolbarEntries = [
        PauseTool,
        RestartTool,
        NewTrackTool,
        null,
        SwitchBikeTool,
        null,
        CameraTool,
        FullscreenTool,
    ];
