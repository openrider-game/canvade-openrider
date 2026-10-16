import { ProgressLayer, ProgressStatus } from '../../shared/layers/progress.layer';
import type { TrackFetcherState } from '../track-fetcher.state';

/** Displays the download progress of the track fetcher state. */
export class TrackFetcherLayer extends ProgressLayer {
    public constructor(private readonly state: TrackFetcherState) {
        super();
    }

    protected getStatus(): ProgressStatus {
        const { progress, total, error } = this.state;

        let text = `Fetching track: ${progress} bytes`;
        if (error) {
            text = `Error fetching track: "${error}"`;
        } else if (total > 0) {
            const percent = Math.round((progress / total) * 100);
            text = `Fetching track: ${percent} % (${progress} / ${total})`;
        }

        return { progress, total, text };
    }
}
