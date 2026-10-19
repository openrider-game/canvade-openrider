import { Layer } from 'canvade';
import { TrackGenerator } from '../../openrider/parser/track-generator';
import { OpenRiderState } from '../openrider.state';
import { STATE_TRACK_UPLOAD } from '../state-names';
import { TrackGeneratorLayer } from './layers/track-generator.layer';

/** Names of the downloaded files. */
const TRACK_FILE_NAME = 'track.txt',
    EDITOR_FILE_NAME = 'track.openrider.json';

/**
 * Generates the code of the session track, one step per update, pushed on top of the editing
 * state.
 *
 * Once done, pops itself and either downloads a file in the session export format, or stores the
 * track code and the editor file in the session and pushes the upload state when the session
 * `trackUpload` flag is set.
 */
export class TrackGeneratorState extends OpenRiderState {
    /** Generator of the running generation, `null` before entering the state and once done. */
    public generator: TrackGenerator | null = null;

    protected initState(): void {
        this.subscribe('enter', this.startGenerating);
        this.subscribe('update', this.generateStep);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([['main', new TrackGeneratorLayer(this)]]);
    }

    private startGenerating(): void {
        this.generator = new TrackGenerator(this.session.track);
    }

    private generateStep(): void {
        const generator = this.generator;
        if (!generator) {
            return;
        }

        generator.currentStep();
        generator.updateIndicators();

        if (!generator.done) {
            return;
        }

        this.generator = null;
        this.manager.pop();

        const session = this.session;

        if (session.trackUpload) {
            session.trackUpload = false;
            session.trackCode = generator.getCode();
            session.editorCode = generator.getEditorCode();
            session.track.pause(true);
            this.manager.push(STATE_TRACK_UPLOAD);
        } else if (session.exportFormat === 'editor') {
            TrackGeneratorState.download(
                generator.getEditorCode(),
                EDITOR_FILE_NAME,
                'application/json',
            );
        } else {
            TrackGeneratorState.download(generator.getCode(), TRACK_FILE_NAME, 'text/plain');
        }
    }

    private static download(content: string, fileName: string, type: string): void {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const downloadLink = document.createElement('a');
        downloadLink.download = fileName;
        downloadLink.href = url;
        downloadLink.click();
        URL.revokeObjectURL(url);
    }
}
