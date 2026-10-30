import { Layer } from 'canvade';
import { GameConfig } from '../../openrider/config/game-config';
import { TRACKDATA_PATH } from '../../openrider/constants/request.constants';
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
 * First state of the game: downloads the track when the session has a track id, to race it, or
 * to edit it when the host element asks for it (see GameConfig); otherwise edits the session
 * track code (the default track when there is none).
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
            session.trackMode = GameConfig.editTrack ? TRACK_MODE_EDITING : TRACK_MODE_RACING;
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
            const response = await Requests.post(GameConfig.url(TRACKDATA_PATH), { id: trackId });
            await Requests.check(response);

            // Compressed responses give their real size in a custom header
            const contentEncoding = response.headers.get('content-encoding');
            const contentLength = response.headers.get(
                contentEncoding ? 'x-file-size' : 'content-length',
            );
            this.total = contentLength ? parseInt(contentLength, 10) : 0;

            const code = await this.readBody(response);
            // Backends answering without a 404 status for an unknown track
            if (code.length === 0 || new TextDecoder().decode(code) === 'false') {
                throw new Error('Track does not exist');
            }

            this.session.trackCode = code;
            this.done = true;
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        }
    }

    /**
     * Reads the track file of the response chunk by chunk to follow the download progress: its
     * bytes, or those of a track saved in an original format, both read by `TrackFormat`.
     */
    private async readBody(response: Response): Promise<Uint8Array> {
        const reader = response.body?.getReader();
        if (!reader) {
            return new Uint8Array(await response.arrayBuffer());
        }

        const chunks: Uint8Array[] = [];
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            this.progress += chunk.value.byteLength;
            chunks.push(chunk.value);
        }

        const body = new Uint8Array(this.progress);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return body;
    }
}
