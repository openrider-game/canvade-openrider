import { Game, State, StateClass } from 'canvade';
import { GameConfig } from './openrider/config/game-config';
import { GAME_UPS } from './openrider/constants/game.constants';
import { GhostService } from './openrider/request/ghost-service';
import { Session } from './states/session';
import States from './states/states';

const hostElement = document.getElementById('game');

if (!hostElement) {
    throw new Error('No host element found');
}

// The host element configures the game for its page, see GameConfig
GameConfig.configure(hostElement);

const game = new Game(hostElement, { updatesPerSecond: GAME_UPS });
const session = new Session(game.shared);

// Races a published track, otherwise the default track is edited
session.trackId = GameConfig.trackId(hostElement, location.search);

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
     * @returns Whether the ghost was toggled, false while no track is parsed.
     */
    toggleGhost(ghostId: number): boolean {
        if (!session.hasTrack()) {
            return false;
        }

        GhostService.toggleGhost(session.track, ghostId).catch((e) =>
            console.error(`Cannot load ghost ${ghostId}`, e),
        );
        return true;
    },

    /** Ids of the ghosts racing, fastest first; empty while no track is parsed. */
    racingGhosts(): number[] {
        return session.hasTrack() ? [...session.track.ghostRunners.keys()] : [];
    },
};

declare global {
    interface Window {
        /** API of the game, see {@link api}. */
        OpenRider: typeof api;
    }
}

window.OpenRider = api;
