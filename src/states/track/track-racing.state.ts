import { LEFT_TOOLBAR_VIEWING } from '../../openrider/tool/toolbar.constants';
import { ToolbarDefinition } from './track-view.definitions';
import { TrackPlayState } from './track-play.state';

/** Racing a published track, against the ghosts picked through the `window.OpenRider` API. */
export class TrackRacingState extends TrackPlayState {
    public getToolbars(): ToolbarDefinition[] {
        return [{ side: 'left', tools: LEFT_TOOLBAR_VIEWING }];
    }
}
