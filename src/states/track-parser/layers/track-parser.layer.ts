import { ProgressLayer, ProgressStatus } from '../../shared/layers/progress.layer';
import type { TrackParserState } from '../track-parser.state';

/** Displays the progress of the track parser state, then of the caching of the track cells. */
export class TrackParserLayer extends ProgressLayer {
    public constructor(private readonly state: TrackParserState) {
        super();
    }

    protected getStatus(): ProgressStatus {
        if (this.state.error) {
            return { progress: 0, total: 0, text: `Error parsing track: "${this.state.error}"` };
        }

        const parser = this.state.parser;
        if (!parser) {
            return { progress: 1, total: 1, text: 'Parsing...' };
        }

        const { progress, length, progressLabel } = parser;
        const percent = length > 0 ? Math.round((progress / length) * 100) : 100;
        const text = parser.caching
            ? `Caching: ${progressLabel} - ${progress} / ${length} cells`
            : `Parsing ${progressLabel}: ${percent} %`;

        return { progress, total: length, text };
    }
}
