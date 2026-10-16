import { ProgressLayer, ProgressStatus } from '../../shared/layers/progress.layer';
import type { TrackGeneratorState } from '../track-generator.state';

/** Displays the progress of the track generator state. */
export class TrackGeneratorLayer extends ProgressLayer {
    public constructor(private readonly state: TrackGeneratorState) {
        super();
    }

    protected getStatus(): ProgressStatus {
        const generator = this.state.generator;
        if (!generator) {
            return { progress: 1, total: 1, text: 'Generating track code...' };
        }

        const { progress, length } = generator;
        const percent = length > 0 ? Math.round((progress / length) * 100) : 100;

        return { progress, total: length, text: `Generating track code: ${percent} %` };
    }
}
