import { GameConfig } from '../../openrider/config/game-config';
import { LiveSession } from '../../openrider/live/live-session';
import { GhostService } from '../../openrider/request/ghost-service';
import { LEFT_TOOLBAR_VIEWING } from '../../openrider/tool/toolbar.constants';
import { ToolbarDefinition } from './track-view.definitions';
import { TrackPlayState } from './track-play.state';

/**
 * Racing a published track, against the ghosts given by the page (see `GameConfig.ghostIds`) and
 * the ones picked through the `window.OpenRider` API, and with the riders of the live session
 * of the page if any (see `GameConfig.live`).
 */
export class TrackRacingState extends TrackPlayState {
    public getToolbars(): ToolbarDefinition[] {
        return [{ side: 'left', tools: LEFT_TOOLBAR_VIEWING }];
    }

    protected override initState(): void {
        super.initState();
        this.subscribe('enter', this.raceInitialGhosts);
        this.subscribe('enter', this.joinLiveSession);
    }

    private raceInitialGhosts(): void {
        GhostService.raceInitialGhosts(this.track);
    }

    private joinLiveSession(): void {
        const live = GameConfig.live;
        if (live && this.track.id !== null) {
            LiveSession.start(this.track, live.url, live.token);
        }
    }
}
