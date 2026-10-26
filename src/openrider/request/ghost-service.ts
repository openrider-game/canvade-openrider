import { GhostRunner } from '../bike/runner/ghost-runner';
import { GameConfig } from '../config/game-config';
import { GHOSTDATA_PATH, GHOSTUPLOAD_PATH } from '../constants/request.constants';
import { EnduranceCourse } from '../endurance/endurance-course';
import { GhostParser } from '../parser/ghost-parser';
import type { Track } from '../track/track';
import { Requests } from './requests';

/** Loads the ghosts of a race and uploads the player runs. */
export abstract class GhostService {
    /**
     * Whether the ghosts of the page can race on the track: always on a published track, and in
     * endurance mode only on the track of the page (see `GameConfig.seed` and
     * `GameConfig.version`), not on a track generated since then by the new track tool.
     */
    public static canRace(track: Track): boolean {
        const course = EnduranceCourse.of(track);
        return (
            course === null ||
            (course.seed === GameConfig.seed && course.version === GameConfig.version)
        );
    }

    /**
     * Adds the ghost to the race, or removes it if it is already racing. A ghost is only added on
     * a track it can race on (see {@link GhostService.canRace}).
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
        if (!GhostService.canRace(track)) {
            return;
        }

        let ghostString = track.ghostCache.get(ghostId);
        if (ghostString === undefined) {
            const url = GameConfig.url(GHOSTDATA_PATH);
            // In endurance mode, the backend only gives the runs of the track ridden
            const course = EnduranceCourse.of(track);
            const response = await Requests.postJson<{ GHOSTSTRING: string }>(url, {
                trackId: track.id ?? 0,
                id: ghostId,
                ...(course === null ? {} : { seed: course.seed, version: course.version }),
            });
            // The track may have changed during the download
            if (!GhostService.canRace(track)) {
                return;
            }
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

    /**
     * Adds the ghosts given by the page to the race, once per page (see `GameConfig.ghostIds`),
     * e.g. the ghost of a link shared to race someone.
     */
    public static raceInitialGhosts(track: Track): void {
        const ghostIds = GameConfig.ghostIds;
        GameConfig.ghostIds = [];
        for (const ghostId of ghostIds) {
            GhostService.toggleGhost(track, ghostId).catch((e) =>
                console.error(`Cannot load ghost ${ghostId}`, e),
            );
        }
    }

    /** Offers the player to upload their run once a race is finished. */
    public static async saveGhost(track: Track): Promise<void> {
        if (!confirm('Do you want to save this time?')) {
            return;
        }

        try {
            const response = await Requests.postJson<{ ID: number }>(
                GameConfig.url(GHOSTUPLOAD_PATH),
                {
                    ghostString: GhostParser.generate(track.playerRunner),
                    trackId: track.id ?? 0,
                    time: track.time,
                },
            );

            console.log(`Ghost saved: ${response.ID}`);
        } catch (e) {
            alert(`Your ghost was refused: ${e}`);
        }
    }
}
