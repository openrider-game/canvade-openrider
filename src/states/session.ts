import { Track } from '../openrider/track/track';
import { TRACK_MODE_EDITING, TrackMode } from '../openrider/track/track.constants';

const TRACK_ID = 'trackId',
    TRACK_CODE = 'trackCode',
    EDITOR_CODE = 'editorCode',
    TRACK_MODE = 'trackMode',
    TRACK = 'track',
    TRACK_UPLOAD = 'trackUpload',
    EXPORT_FORMAT = 'exportFormat';

/**
 * Format of an export: a track code, merging the layers of each type, or an editor file keeping
 * the layers of the editor.
 */
export type ExportFormat = 'code' | 'editor';

/**
 * Typed access to the data shared between the states of the game.
 *
 * Wraps the untyped `shared` map of the canvade state manager (`manager.shared`, also
 * `game.shared`): a session holds no data itself, so any number of instances can be created over
 * the same map.
 */
export class Session {
    public constructor(private readonly shared: Map<string, unknown>) {}

    /** Id of the published track to download, to race or edit; `null` to edit a new track. */
    public get trackId(): number | null {
        return (this.shared.get(TRACK_ID) as number | undefined) ?? null;
    }

    public set trackId(trackId: number | null) {
        this.shared.set(TRACK_ID, trackId);
    }

    /**
     * Code of the track to parse, a track code or an editor file, or the track code generated to
     * be uploaded; `null` until fetched.
     */
    public get trackCode(): string | null {
        return (this.shared.get(TRACK_CODE) as string | undefined) ?? null;
    }

    public set trackCode(trackCode: string | null) {
        this.shared.set(TRACK_CODE, trackCode);
    }

    /** Editor file generated to be uploaded, along with {@link Session.trackCode}. */
    public get editorCode(): string | null {
        return (this.shared.get(EDITOR_CODE) as string | undefined) ?? null;
    }

    public set editorCode(editorCode: string | null) {
        this.shared.set(EDITOR_CODE, editorCode);
    }

    /** Format of the file downloaded by the track generator state, a track code by default. */
    public get exportFormat(): ExportFormat {
        return (this.shared.get(EXPORT_FORMAT) as ExportFormat | undefined) ?? 'code';
    }

    public set exportFormat(exportFormat: ExportFormat) {
        this.shared.set(EXPORT_FORMAT, exportFormat);
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
