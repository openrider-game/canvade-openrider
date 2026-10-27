import { ItemGroupTool, LineGroupTool, ShapeGroupTool, StatusGroupTool } from './group/group.tools';
import { CameraTool } from './misc/camera.tool';
import { CancelCheckpointTool } from './misc/cancel-checkpoint.tool';
import { ControlsTool } from './misc/controls.tool';
import { EraserTool } from './misc/eraser.tool';
import { FocusRiderTool } from './misc/focus-rider.tool';
import { FullscreenTool } from './misc/fullscreen.tool';
import { RedoTool, UndoTool } from './misc/history.tool';
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
        FocusRiderTool,
        null,
        CameraTool,
        FullscreenTool,
        ControlsTool,
    ],
    /**
     * Left toolbar in the editor, adding the history buttons: without the focus on the other
     * riders, the editor having no ghosts nor riders of a live session.
     */
    LEFT_TOOLBAR_EDITING: ToolbarEntries = [
        PauseTool,
        RestartTool,
        CancelCheckpointTool,
        null,
        SwitchBikeTool,
        CameraTool,
        FullscreenTool,
        ControlsTool,
        null,
        UndoTool,
        RedoTool,
    ],
    /** Right toolbar in the editor, with the drawing tools. */
    RIGHT_TOOLBAR: ToolbarEntries = [
        LineGroupTool,
        ShapeGroupTool,
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
    /** Left toolbar in endurance mode: no checkpoints. */
    LEFT_TOOLBAR_ENDURANCE: ToolbarEntries = [
        PauseTool,
        RestartTool,
        null,
        SwitchBikeTool,
        FocusRiderTool,
        null,
        CameraTool,
        FullscreenTool,
        ControlsTool,
    ];
