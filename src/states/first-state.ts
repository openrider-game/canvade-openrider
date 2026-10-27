import { GameConfig } from '../openrider/config/game-config';
import { STATE_ENDURANCE_SETUP, STATE_TRACK_FETCHER } from './state-names';

/**
 * Name of the state the game starts with: the endurance mode generates its own track, the other
 * modes fetch or edit one.
 */
export function firstStateName(): string {
    return GameConfig.mode === 'endurance' ? STATE_ENDURANCE_SETUP : STATE_TRACK_FETCHER;
}
