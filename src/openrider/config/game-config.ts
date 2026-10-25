/**
 * Settings given by the page hosting the game, as data attributes of its host element:
 *
 * - `data-track-id`: id of the published track to race; without it, the `?track=<id>` parameter
 *   of the page URL, and without both a new track is edited.
 * - `data-track-mode`: `edit` to edit the track of `data-track-id` instead of racing it, e.g. to
 *   go on with a draft; downloaded from the trackdata endpoint all the same.
 * - `data-base-url`: URL of the folder holding the backend (`backend/db/`) and the icons
 *   (`media/`), the folder of the page by default.
 * - `data-track-url`: URL of the page racing a published track, opened after an upload, `{id}`
 *   being replaced by the track id; `?track={id}` by default.
 * - `data-game-mode`: `endurance` to ride an infinite generated track instead, see
 *   `TrackEnduranceState`; else the `?mode=endurance` parameter of the page URL.
 * - `data-seed`: in endurance mode, seed of the generated track, to ride a given one again; else
 *   the `?seed=<seed>` parameter of the page URL, and without both a new track on each load.
 * - `data-endurance-save`: `1` to upload the runs on the track of `data-seed` to its leaderboard,
 *   with the enduranceupload endpoint, each one beating the best of the player so far.
 * - `data-endurance-best`: best run of the player on that track, `<meters>,<ticks>`, uploaded
 *   before: only the runs beating it are uploaded.
 * - `data-ghosts`: ids of the ghosts racing from the start, separated with commas, e.g. from a
 *   link shared to race someone; else the `?ghosts=<ids>` parameter of the page URL.
 *
 * For example, a page of a website racing the track 3:
 * `<div id="game" data-track-id="3" data-base-url="/" data-track-url="/tracks/{id}/"></div>`.
 */
/** Most ghosts racing from the start, see `GameConfig.ghostIds`. */
const MAX_INITIAL_GHOSTS = 10;

export abstract class GameConfig {
    /** URL of the folder holding `backend/db/` and `media/`, ending with a `/`. */
    public static baseUrl = './';
    /** URL of the page racing a published track, `{id}` being replaced by its id. */
    public static trackUrl = '?track={id}';
    /** Whether the downloaded track is edited rather than raced. */
    public static editTrack = false;
    /** Game mode: the tracks to race or edit, or the endurance mode. */
    public static mode: 'tracks' | 'endurance' = 'tracks';
    /** Seed of the endurance track, null for a new one. */
    public static seed: number | null = null;
    /** Whether the endurance runs on the track of {@link seed} are uploaded to its leaderboard. */
    public static enduranceSave = false;
    /** Best run uploaded on that track, the next uploads beating it, null without any. */
    public static enduranceBest: { distance: number; time: number } | null = null;
    /** Ghosts racing from the start, by id, cleared once added to the race. */
    public static ghostIds: number[] = [];

    /**
     * Reads the settings of the host element, and else of the parameters of the page URL for
     * the mode and the seed, keeping the defaults of the missing ones.
     */
    public static configure(host: HTMLElement, search = ''): void {
        const { baseUrl, trackUrl, trackMode } = host.dataset;
        const params = new URLSearchParams(search);
        if (baseUrl) {
            GameConfig.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        }
        if (trackUrl) {
            GameConfig.trackUrl = trackUrl;
        }
        GameConfig.editTrack = trackMode === 'edit';
        GameConfig.mode =
            (host.dataset.gameMode ?? params.get('mode')) === 'endurance' ? 'endurance' : 'tracks';

        const seed = Number(host.dataset.seed ?? params.get('seed') ?? NaN);
        GameConfig.seed = Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32 ? seed : null;

        GameConfig.enduranceSave = host.dataset.enduranceSave === '1' && GameConfig.seed !== null;
        const [distance, time] = (host.dataset.enduranceBest ?? '').split(',').map(Number);
        GameConfig.enduranceBest =
            Number.isFinite(distance) && Number.isInteger(time) ? { distance, time } : null;

        GameConfig.ghostIds = (host.dataset.ghosts ?? params.get('ghosts') ?? '')
            .split(',')
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
            .slice(0, MAX_INITIAL_GHOSTS);
    }

    /**
     * Id of the track to download: the `data-track-id` attribute of the host element, else the
     * `track` parameter of the page URL; `null` to edit a new track.
     */
    public static trackId(host: HTMLElement, search: string): number | null {
        const trackId = Number(host.dataset.trackId ?? new URLSearchParams(search).get('track'));
        return Number.isInteger(trackId) && trackId > 0 ? trackId : null;
    }

    /** URL of a file of the game folder, e.g. `backend/db/trackdata/`. */
    public static url(path: string): string {
        return GameConfig.baseUrl + path;
    }

    /** URL of the page racing a published track. */
    public static trackPage(trackId: number): string {
        return GameConfig.trackUrl.replace('{id}', String(trackId));
    }
}
