import { LEFT_TOOLBAR_EDITING, RIGHT_TOOLBAR } from '../../openrider/tool/toolbar.constants';
import { STATE_TRACK_GENERATOR } from '../state-names';
import { ButtonDefinition, ToolbarDefinition } from './track-view.definitions';
import { TrackPlayState } from './track-play.state';

/** Common definition of the action buttons, at the bottom left of the canvas. */
const ACTION_BUTTON = { y: 10, width: 60, height: 26, verticalAlign: 'bottom' } as const;

/** Drawing a track, which can then be imported from a file, exported to a file or uploaded. */
export class TrackEditingState extends TrackPlayState {
    public getToolbars(): ToolbarDefinition[] {
        return [
            { side: 'left', tools: LEFT_TOOLBAR_EDITING },
            { side: 'right', tools: RIGHT_TOOLBAR },
        ];
    }

    public override getButtons(): ButtonDefinition[] {
        return [
            { ...ACTION_BUTTON, x: 10, label: 'Import', action: () => this.importTrack() },
            { ...ACTION_BUTTON, x: 80, label: 'Export', action: () => this.generateTrack(false) },
            { ...ACTION_BUTTON, x: 150, label: 'Upload', action: () => this.generateTrack(true) },
        ];
    }

    /**
     * Loads a track code from a file, then pops back to the parser state, which parses it as a new
     * track to edit.
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
                const session = this.session;
                session.trackCode = String(reader.result);
                session.trackId = null;
                this.manager.pop();
            });
            reader.readAsText(file);
        });

        input.click();
    }

    private generateTrack(upload: boolean): void {
        this.session.trackUpload = upload;
        this.manager.push(STATE_TRACK_GENERATOR);
    }
}
