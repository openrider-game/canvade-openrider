import { TrackFormat } from '../../openrider/parser/track-format';
import { CameraTool } from '../../openrider/tool/misc/camera.tool';
import { LEFT_TOOLBAR_EDITING, RIGHT_TOOLBAR } from '../../openrider/tool/toolbar.constants';
import type { ExportFormat } from '../session';
import { STATE_TRACK_GENERATOR } from '../state-names';
import { ButtonDefinition, ToolbarDefinition } from './track-view.definitions';
import { TrackPlayState } from './track-play.state';

/** Common definition of the action buttons, at the bottom left of the canvas. */
const ACTION_BUTTON = { y: 10, height: 26, verticalAlign: 'bottom' } as const;

/**
 * Drawing a track on any number of layers. The track can be imported from a track code or an
 * editor file, exported to either of them, or uploaded.
 */
export class TrackEditingState extends TrackPlayState {
    public override editsLayers(): boolean {
        return true;
    }

    /**
     * Shows the touch controls with the camera tool only: the fingers draw with the other tools,
     * all over the canvas.
     */
    public override showsTouchControls(): boolean {
        return this.track.toolManager.tool instanceof CameraTool;
    }

    public getToolbars(): ToolbarDefinition[] {
        return [
            { side: 'left', tools: LEFT_TOOLBAR_EDITING },
            { side: 'right', tools: RIGHT_TOOLBAR },
        ];
    }

    public override getButtons(): ButtonDefinition[] {
        return [
            {
                ...ACTION_BUTTON,
                x: 10,
                width: 60,
                label: 'Import',
                action: () => this.importTrack(),
            },
            {
                ...ACTION_BUTTON,
                x: 80,
                width: 90,
                label: 'Export code',
                action: () => this.exportTrack('code'),
            },
            {
                ...ACTION_BUTTON,
                x: 180,
                width: 100,
                label: 'Export editor',
                action: () => this.exportTrack('editor'),
            },
            {
                ...ACTION_BUTTON,
                x: 290,
                width: 60,
                label: 'Upload',
                action: () => this.uploadTrack(),
            },
        ];
    }

    /**
     * Loads a track code or an editor file, then pops back to the parser state, which parses it
     * as a new track to edit: a track code becomes a main and a foreground layer.
     *
     * An invalid editor file is refused with an alert, keeping the current track.
     */
    private importTrack(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.addEventListener('load', () => {
                const code = String(reader.result);
                try {
                    TrackFormat.read(code);
                } catch (e) {
                    alert(`This file cannot be imported: ${e instanceof Error ? e.message : e}`);
                    return;
                }

                const session = this.session;
                session.trackCode = code;
                session.trackId = null;
                this.manager.pop();
            });
            reader.readAsText(file);
        });

        input.click();
    }

    private exportTrack(format: ExportFormat): void {
        this.session.exportFormat = format;
        this.session.trackUpload = false;
        this.manager.push(STATE_TRACK_GENERATOR);
    }

    private uploadTrack(): void {
        this.session.trackUpload = true;
        this.manager.push(STATE_TRACK_GENERATOR);
    }
}
