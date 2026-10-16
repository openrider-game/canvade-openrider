import { Layer } from 'canvade';
import { TrackGenerator } from '../../openrider/parser/track-generator';
import { OpenRiderState } from '../openrider.state';
import { STATE_TRACK_UPLOAD } from '../state-names';
import { TrackGeneratorLayer } from './layers/track-generator.layer';

/**
 * Generates the code of the session track, one step per update, pushed on top of the editing
 * state.
 *
 * Once done, pops itself and either downloads the code, or stores it in the session and pushes
 * the upload state when the session `trackUpload` flag is set.
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
        const trackCode = generator.getCode();

        if (session.trackUpload) {
            session.trackUpload = false;
            session.trackCode = trackCode;
            session.track.pause(true);
            this.manager.push(STATE_TRACK_UPLOAD);
        } else {
            TrackGeneratorState.download(trackCode);
        }
    }

    private static download(trackCode: string): void {
        const url = URL.createObjectURL(new Blob([trackCode], { type: 'text/plain' }));
        const downloadLink = document.createElement('a');
        downloadLink.download = 'track.txt';
        downloadLink.href = url;
        downloadLink.click();
        URL.revokeObjectURL(url);
    }
}
