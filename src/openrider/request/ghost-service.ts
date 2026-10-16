import { GhostRunner } from '../bike/runner/ghost-runner';
import { GHOSTDATA_URL, GHOSTUPLOAD_URL } from '../constants/request.constants';
import { GhostParser } from '../parser/ghost-parser';
import type { Track } from '../track/track';
import { Requests } from './requests';

/** Loads the ghosts of a race and uploads the player runs. */
export abstract class GhostService {
    /**
     * Adds the ghost to the race, or removes it if it is already racing.
     *
     * Ghost strings are downloaded once and cached on the track. Adding a ghost restarts the race
     * from the start position for every runner.
     */
    public static async toggleGhost(track: Track, ghostId: number): Promise<void> {
        if (track.ghostRunners.has(ghostId)) {
            track.ghostRunners.delete(ghostId);
            track.updateFocalPoint();
            return;
        }

        let ghostString = track.ghostCache.get(ghostId);
        if (ghostString === undefined) {
            const response = await Requests.postJson<{ GHOSTSTRING: string }>(GHOSTDATA_URL, {
                trackId: track.id ?? 0,
                id: ghostId,
            });
            ghostString = response.GHOSTSTRING;
            track.ghostCache.set(ghostId, ghostString);
        }

        const ghost = new GhostRunner(track, ghostString);
        ghost.createBike();
        track.ghostRunners.set(ghostId, ghost);

        // Fastest ghosts first
        track.ghostRunners = new Map(
            [...track.ghostRunners.entries()].sort((a, b) => a[1].finalTime - b[1].finalTime),
        );

        // Every runner starts over, so that they all race at the same time
        track.playerRunner.reset();
        track.ghostRunners.forEach((runner) => runner.reset());

        track.restart();
    }

    /** Offers the player to upload their run once a race is finished. */
    public static async saveGhost(track: Track): Promise<void> {
        if (!confirm('Do you want to save this time?')) {
            return;
        }

        try {
            const response = await Requests.postJson<{ ID: number }>(GHOSTUPLOAD_URL, {
                ghostString: GhostParser.generate(track.playerRunner),
                trackId: track.id ?? 0,
                time: track.time,
            });

            console.log(`Ghost saved: ${response.ID}`);
        } catch (e) {
            alert(`Your ghost was refused: ${e}`);
        }
    }
}
