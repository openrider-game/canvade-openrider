import { GameUpdateEvent } from 'canvade';
import { GameConfig } from '../../openrider/config/game-config';
import { LiveEditSession } from '../../openrider/live/live-edit-session';
import { TrackFormat } from '../../openrider/parser/track-format';
import { CameraTool } from '../../openrider/tool/misc/camera.tool';
import { LEFT_TOOLBAR_EDITING, RIGHT_TOOLBAR } from '../../openrider/tool/toolbar.constants';
import type { ExportFormat } from '../session';
import { STATE_TRACK_GENERATOR } from '../state-names';
import { ButtonDefinition, ToolbarDefinition } from './track-view.definitions';
import { TrackPlayState } from './track-play.state';

/** Common definition of the action buttons, at the bottom left of the canvas. */
const ACTION_BUTTON = { y: 10, height: 26, verticalAlign: 'bottom' } as const;
/** Offset of the first action button from the left, then between two buttons, in UI pixels. */
const ACTION_BUTTON_LEFT = 10,
    ACTION_BUTTON_GAP = 10;

/**
 * Drawing a track on any number of layers. The track can be imported from a track code or an
 * editor file, exported to either of them, or uploaded.
 *
 * With the live session of the page (see `GameConfig.live`), the player edits the track with
 * the other editors of the session (see `LiveEditSession`): the track is then the one of the
 * session, not imported.
 */
export class TrackEditingState extends TrackPlayState {
    protected override initState(): void {
        super.initState();
        this.subscribe('enter', this.joinEditSession);
        this.subscribe('update', this.sendEdits);
    }

    private joinEditSession(): void {
        const live = GameConfig.live;
        if (live) {
            LiveEditSession.start(this.track, live.url, live.token);
        }
    }

    private sendEdits(e: CustomEvent<GameUpdateEvent>): void {
        LiveEditSession.of(this.track)?.update(e.detail.delta);
    }

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

    /**
     * The action buttons, side by side from the left. In an editing session, the track is the one
     * of the session, not imported, and only its host exports and uploads it.
     */
    public override getButtons(): ButtonDefinition[] {
        const live = LiveEditSession.of(this.track);
        const buttons: Array<Omit<ButtonDefinition, 'x'>> = [];
        if (!live) {
            buttons.push({
                ...ACTION_BUTTON,
                width: 60,
                label: 'Import',
                action: () => this.importTrack(),
            });
        }
        if (!live || live.isHost) {
            buttons.push(
                {
                    ...ACTION_BUTTON,
                    width: 90,
                    label: 'Export code',
                    action: () => this.exportTrack('code'),
                },
                {
                    ...ACTION_BUTTON,
                    width: 100,
                    label: 'Export editor',
                    action: () => this.exportTrack('editor'),
                },
                { ...ACTION_BUTTON, width: 60, label: 'Upload', action: () => this.uploadTrack() },
            );
        }

        let x = ACTION_BUTTON_LEFT;
        return buttons.map((button) => {
            const placed = { ...button, x };
            x += button.width + ACTION_BUTTON_GAP;
            return placed;
        });
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
