import { GameKeyboardEvent, GameUpdateEvent } from 'canvade';
import type { Track } from '../../openrider/track/track';
import { OpenRiderState } from '../openrider.state';
import { ButtonDefinition, ToolbarDefinition } from './track-view.definitions';

/**
 * Base of the states displaying the session track with its tools: dispatches the keyboard
 * shortcuts and the updates to the tools, and pauses the track when the page is hidden.
 *
 * The toolbars and buttons are built by the `TrackInterfaceLayer` of the state.
 */
export abstract class TrackViewState extends OpenRiderState {
    /** Session track, only available once the state is entered. */
    public get track(): Track {
        return this.session.track;
    }

    /** Toolbars of the state, whose tools are created each time the state is entered. */
    public abstract getToolbars(): ToolbarDefinition[];

    /**
     * Whether the state can display the debug mode: its overlays and the debug panel. False by
     * default: the debug mode is only displayed while riding.
     */
    public allowsDebug(): boolean {
        return false;
    }

    /**
     * Whether the state edits the layers of the track: it then displays the layers panel and
     * leaves out the hidden layers. False by default: the layers are only edited in the editor.
     */
    public editsLayers(): boolean {
        return false;
    }

    /** Text buttons of the state, none by default. */
    public getButtons(): ButtonDefinition[] {
        return [];
    }

    protected initState(): void {
        this.subscribe('enter', this.attachTrack);
        this.subscribe('keyboardDown', this.runToolShortcut);
        this.subscribe('visibilityChange', this.pauseWhenHidden);
        this.subscribe('fixedUpdate', this.fixedUpdateTools);
        this.subscribe('update', this.updateTools);
    }

    /**
     * The track is the world of the state, so that the engine computes the mouse world position.
     * The track is being edited in the states editing its layers: the editor.
     */
    private attachTrack(): void {
        this.setWorld(this.track);
        this.track.editing = this.editsLayers();
    }

    private runToolShortcut(e: CustomEvent<GameKeyboardEvent>): void {
        const key = e.detail.key;
        if (key) {
            this.track.toolCollection.getByKeyLabel(key)?.run();
        }
    }

    private pauseWhenHidden(): void {
        if (document.hidden) {
            this.track.pause(true);
        }
    }

    private fixedUpdateTools(): void {
        this.track.toolManager.fixedUpdate();
    }

    private updateTools(e: CustomEvent<GameUpdateEvent>): void {
        this.track.toolManager.update(e.detail.progress, e.detail.delta);
    }
}
