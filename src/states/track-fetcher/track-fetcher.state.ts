import { Layer } from 'canvade';
import { TRACKDATA_URL } from '../../openrider/constants/request.constants';
import { Requests } from '../../openrider/request/requests';
import {
    TRACK_DEFAULT,
    TRACK_MODE_EDITING,
    TRACK_MODE_RACING,
} from '../../openrider/track/track.constants';
import { OpenRiderState } from '../openrider.state';
import { STATE_TRACK_PARSER } from '../state-names';
import { TrackFetcherLayer } from './layers/track-fetcher.layer';

/**
 * First state of the game: downloads the track to race when the session has a track id, otherwise
 * edits the session track code (the default track when there is none).
 *
 * Sets the session track mode, then pushes the parser state on the next update once the track
 * code is available.
 */
export class TrackFetcherState extends OpenRiderState {
    /** Number of bytes of the track downloaded so far. */
    public progress = 0;
    /** Size of the downloaded track in bytes, 0 when unknown. */
    public total = 0;
    /** Message of the error that stopped the download, empty when there is none. */
    public error = '';
    private done = false;

    protected initState(): void {
        this.subscribe('enter', this.startFetching);
        this.subscribe('update', this.checkFetched);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([['main', new TrackFetcherLayer(this)]]);
    }

    private startFetching(): void {
        this.progress = 0;
        this.total = 0;
        this.error = '';
        this.done = false;

        const session = this.session;
        const trackId = session.trackId;

        if (trackId) {
            session.trackMode = TRACK_MODE_RACING;
            void this.fetchTrack(trackId);
        } else {
            session.trackMode = TRACK_MODE_EDITING;
            session.trackCode = session.trackCode || TRACK_DEFAULT;
            this.done = true;
        }
    }

    private checkFetched(): void {
        if (this.done) {
            this.done = false;
            this.manager.push(STATE_TRACK_PARSER);
        }
    }

    private async fetchTrack(trackId: number): Promise<void> {
        try {
            const response = await Requests.post(TRACKDATA_URL, { id: trackId });
            await Requests.check(response);

            // Compressed responses give their real size in a custom header
            const contentEncoding = response.headers.get('content-encoding');
            const contentLength = response.headers.get(
                contentEncoding ? 'x-file-size' : 'content-length',
            );
            this.total = contentLength ? parseInt(contentLength, 10) : 0;

            const data = JSON.parse(await this.readBody(response)) as { CODE: string } | false;
            if (!data) {
                throw new Error('Track does not exist');
            }

            this.session.trackCode = data.CODE;
            this.done = true;
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        }
    }

    /** Reads the response chunk by chunk to follow the download progress. */
    private async readBody(response: Response): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            return response.text();
        }

        const decoder = new TextDecoder();
        let body = '';

        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            this.progress += chunk.value.byteLength;
            body += decoder.decode(chunk.value, { stream: true });
        }

        return body + decoder.decode();
    }
}
