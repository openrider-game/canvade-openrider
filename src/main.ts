import { Game, State, StateClass } from 'canvade';
import { GAME_UPS } from './openrider/constants/game.constants';
import { GhostService } from './openrider/request/ghost-service';
import { Session } from './states/session';
import States from './states/states';

const hostElement = document.getElementById('game');

if (!hostElement) {
    throw new Error('No host element found');
}

const game = new Game(hostElement, { updatesPerSecond: GAME_UPS });
const session = new Session(game.shared);

// The `?track=<id>` URL parameter races a published track, otherwise the default track is edited
const trackId = Number(new URLSearchParams(location.search).get('track'));
session.trackId = Number.isInteger(trackId) && trackId > 0 ? trackId : null;

game.addStates(
    new Map<string, StateClass<State>>(
        Object.values(States).map(({ name, state }) => [name, state]),
    ),
);
game.pushState(States.TrackFetcher.name);

game.run();

/**
 * API exposed to the page hosting the game as `window.OpenRider`, e.g. to pick the ghosts to race
 * against.
 */
const api = {
    /**
     * Adds the ghost to the race, or removes it when it is already racing. The ghost is downloaded
     * the first time. Does nothing until a track has been parsed.
     *
     * @param ghostId - Id of the published ghost.
     */
    toggleGhost(ghostId: number): void {
        if (session.hasTrack()) {
            GhostService.toggleGhost(session.track, ghostId).catch((e) =>
                console.error(`Cannot load ghost ${ghostId}`, e),
            );
        }
    },
};

declare global {
    interface Window {
        /** API of the game, see {@link api}. */
        OpenRider: typeof api;
    }
}

window.OpenRider = api;
