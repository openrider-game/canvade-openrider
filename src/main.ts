import { Game, State, StateClass } from 'canvade';
import { GameConfig } from './openrider/config/game-config';
import { EnduranceCourse } from './openrider/endurance/endurance-course';
import { GAME_UPS } from './openrider/constants/game.constants';
import { GhostService } from './openrider/request/ghost-service';
import { Session } from './states/session';
import States from './states/states';

const hostElement = document.getElementById('game');

if (!hostElement) {
    throw new Error('No host element found');
}

// The host element configures the game for its page, see GameConfig
GameConfig.configure(hostElement, location.search);

const game = new Game(hostElement, { updatesPerSecond: GAME_UPS });
const session = new Session(game.shared);

// Races a published track, otherwise the default track is edited
session.trackId = GameConfig.trackId(hostElement, location.search);

game.addStates(
    new Map<string, StateClass<State>>(
        Object.values(States).map(({ name, state }) => [name, state]),
    ),
);
// The endurance mode generates its own track, the other modes fetch or edit one
game.pushState(
    GameConfig.mode === 'endurance' ? States.EnduranceSetup.name : States.TrackFetcher.name,
);

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
     * @returns Whether the ghost was toggled, false while no track is parsed, or when the ghost
     * cannot race on the track ridden: in endurance mode, a track generated since the page was
     * loaded (see {@link api.trackSeed}).
     */
    toggleGhost(ghostId: number): boolean {
        if (!session.hasTrack()) {
            return false;
        }
        const track = session.track;
        if (!track.ghostRunners.has(ghostId) && !GhostService.canRace(track)) {
            return false;
        }

        GhostService.toggleGhost(track, ghostId).catch((e) =>
            console.error(`Cannot load ghost ${ghostId}`, e),
        );
        return true;
    },

    /** Ids of the ghosts racing, fastest first; empty while no track is parsed. */
    racingGhosts(): number[] {
        return session.hasTrack() ? [...session.track.ghostRunners.keys()] : [];
    },

    /**
     * Seed of the endurance track ridden, which the new track tool changes; null outside of the
     * endurance mode, or while no track is created.
     */
    trackSeed(): number | null {
        return session.hasTrack() ? (EnduranceCourse.of(session.track)?.seed ?? null) : null;
    },
};

declare global {
    interface Window {
        /** API of the game, see {@link api}. */
        OpenRider: typeof api;
    }
}

window.OpenRider = api;
