import { GameConfig } from '../config/game-config';
import { ENDURANCEUPLOAD_PATH } from '../constants/request.constants';
import { EnduranceRecords, EnduranceResult } from '../endurance/endurance-records';
import type { EnduranceRun } from '../endurance/endurance-run';
import { Requests } from './requests';

/** Event dispatched on the document once a run is saved, for the page to show its leaderboard. */
export const ENDURANCE_SAVED_EVENT = 'openrider:endurance-saved';

/**
 * Uploads the endurance runs to the leaderboard of their track, when the page asks for it (see
 * `GameConfig.enduranceSave`): the backend replays a run from its seed before ranking it.
 */
export abstract class EnduranceService {
    /** Whether a result goes to the leaderboard: on its track, beating the best one uploaded. */
    public static shouldSave(result: EnduranceResult | null): result is EnduranceResult {
        const best = GameConfig.enduranceBest;
        return (
            result !== null &&
            GameConfig.enduranceSave &&
            result.seed === GameConfig.seed &&
            (result.version ?? 1) === GameConfig.version &&
            EnduranceRecords.beats(result, best && { ...best, seed: result.seed })
        );
    }

    /** Uploads the run just over, showing how it went in the run (see {@link EnduranceRun.upload}). */
    public static async saveRun(run: EnduranceRun): Promise<void> {
        const { result, ghostString } = run;
        if (result === null || ghostString === null) {
            return;
        }

        // The run may be over and another one started by the answer
        const update = (upload: EnduranceRun['upload']) => {
            if (run.result === result) {
                run.upload = upload;
            }
        };
        update({ state: 'saving' });

        try {
            const response = await Requests.postJson<{ ID: number; RANK: number }>(
                GameConfig.url(ENDURANCEUPLOAD_PATH),
                {
                    seed: result.seed,
                    version: result.version ?? 1,
                    ghostString,
                    time: result.time,
                    distance: Math.floor(result.distance),
                },
            );
            GameConfig.enduranceBest = { distance: result.distance, time: result.time };
            update({ state: 'saved', rank: response.RANK });
            document.dispatchEvent(
                new CustomEvent(ENDURANCE_SAVED_EVENT, {
                    detail: { id: response.ID, rank: response.RANK },
                }),
            );
        } catch (e) {
            update({ state: 'refused', reason: e instanceof Error ? e.message : String(e) });
        }
    }
}
