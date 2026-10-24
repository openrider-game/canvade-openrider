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
 *
 * For example, a page of a website racing the track 3:
 * `<div id="game" data-track-id="3" data-base-url="/" data-track-url="/tracks/{id}/"></div>`.
 */
export abstract class GameConfig {
    /** URL of the folder holding `backend/db/` and `media/`, ending with a `/`. */
    public static baseUrl = './';
    /** URL of the page racing a published track, `{id}` being replaced by its id. */
    public static trackUrl = '?track={id}';
    /** Whether the downloaded track is edited rather than raced. */
    public static editTrack = false;

    /** Reads the settings of the host element, keeping the defaults of the missing ones. */
    public static configure(host: HTMLElement): void {
        const { baseUrl, trackUrl, trackMode } = host.dataset;
        if (baseUrl) {
            GameConfig.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        }
        if (trackUrl) {
            GameConfig.trackUrl = trackUrl;
        }
        GameConfig.editTrack = trackMode === 'edit';
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
