import { Track } from '../openrider/track/track';
import { TRACK_MODE_EDITING, TrackMode } from '../openrider/track/track.constants';

const TRACK_ID = 'trackId',
    TRACK_CODE = 'trackCode',
    TRACK_MODE = 'trackMode',
    TRACK = 'track',
    TRACK_UPLOAD = 'trackUpload';

/**
 * Typed access to the data shared between the states of the game.
 *
 * Wraps the untyped `shared` map of the canvade state manager (`manager.shared`, also
 * `game.shared`): a session holds no data itself, so any number of instances can be created over
 * the same map.
 */
export class Session {
    public constructor(private readonly shared: Map<string, unknown>) {}

    /** Id of the published track to race, `null` when editing a track. */
    public get trackId(): number | null {
        return (this.shared.get(TRACK_ID) as number | undefined) ?? null;
    }

    public set trackId(trackId: number | null) {
        this.shared.set(TRACK_ID, trackId);
    }

    /** Code of the track to parse, or generated to be uploaded; `null` until fetched. */
    public get trackCode(): string | null {
        return (this.shared.get(TRACK_CODE) as string | undefined) ?? null;
    }

    public set trackCode(trackCode: string | null) {
        this.shared.set(TRACK_CODE, trackCode);
    }

    /** Whether the parsed track is raced or edited, set by the track fetcher state. */
    public get trackMode(): TrackMode {
        return (this.shared.get(TRACK_MODE) as TrackMode | undefined) ?? TRACK_MODE_EDITING;
    }

    public set trackMode(trackMode: TrackMode) {
        this.shared.set(TRACK_MODE, trackMode);
    }

    /** Whether the track generator state uploads the generated code instead of downloading it. */
    public get trackUpload(): boolean {
        return this.shared.get(TRACK_UPLOAD) === true;
    }

    public set trackUpload(trackUpload: boolean) {
        this.shared.set(TRACK_UPLOAD, trackUpload);
    }

    public hasTrack(): boolean {
        return this.shared.get(TRACK) instanceof Track;
    }

    /**
     * Track built by the parser state, then used by the editing, racing, generator and upload
     * states.
     *
     * @throws When no track has been parsed yet (see {@link Session.hasTrack}).
     */
    public get track(): Track {
        const track = this.shared.get(TRACK);
        if (!(track instanceof Track)) {
            throw new Error('No track has been parsed yet');
        }

        return track;
    }

    public set track(track: Track) {
        this.shared.set(TRACK, track);
    }
}
