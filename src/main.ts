import { Game, State, StateClass } from 'canvade';
import { GameConfig } from './openrider/config/game-config';
import { EnduranceCourse } from './openrider/endurance/endurance-course';
import { GAME_UPS } from './openrider/constants/game.constants';
import { LiveEditSession, LiveEditState } from './openrider/live/live-edit-session';
import { LiveSession, LiveState } from './openrider/live/live-session';
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
     * cannot race on the track ridden (see `GhostService.canRace` and {@link api.trackSeed}).
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
     * State of the live session of the page, racing or editing the track, null outside of one or
     * before the track is parsed; then told with the `openrider:live` event on the document.
     */
    live(): LiveState | LiveEditState | null {
        if (!session.hasTrack()) {
            return null;
        }
        const track = session.track;
        return LiveSession.of(track)?.state ?? LiveEditSession.of(track)?.state ?? null;
    },

    /**
     * Seed of the endurance track ridden: the one of the page, or a new one without; null outside
     * of the endurance mode, or while no track is created.
     */
    trackSeed(): number | null {
        return session.hasTrack() ? (EnduranceCourse.of(session.track)?.seed ?? null) : null;
    },

    /**
     * Version of the generator of the endurance track ridden, see {@link api.trackSeed}; null
     * outside of the endurance mode, or while no track is created.
     */
    trackVersion(): number | null {
        return session.hasTrack() ? (EnduranceCourse.of(session.track)?.version ?? null) : null;
    },
};

declare global {
    interface Window {
        /** API of the game, see {@link api}. */
        OpenRider: typeof api;
    }
}

window.OpenRider = api;
