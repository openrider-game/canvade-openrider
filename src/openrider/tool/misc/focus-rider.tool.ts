import { Control, CTRL, KEYG } from 'canvade';
import type { FollowedRider } from '../../track/track';
import { Tool } from '../tool';

/**
 * Cycles the camera through the other riders: the riders of the live session first, then the
 * ghosts, then back to the player. The camera follows each one whatever they do (see
 * `Track.follow`), until the player rides.
 */
export class FocusRiderTool extends Tool {
    public static override readonly toolName: string = 'Focus rider';
    public static override readonly key = new Control(KEYG, CTRL);
    public static override readonly icon = 'focus';

    public override run(): void {
        const track = this.track;
        const riders: FollowedRider[] = [
            ...[...track.remoteRunners.keys()].map((id): FollowedRider => ({ kind: 'remote', id })),
            ...[...track.ghostRunners.keys()].map((id): FollowedRider => ({ kind: 'ghost', id })),
        ];

        // The rider followed, or watched: e.g. the first ghost when racing starts
        const followed = track.followed;
        const current = riders.findIndex((rider) =>
            followed
                ? rider.kind === followed.kind && rider.id === followed.id
                : track.focalPoint !== null &&
                  track.runnerOf(rider)?.instance?.hitbox === track.focalPoint,
        );

        // After the last one, back to the player
        track.follow(riders[current + 1] ?? null);
    }
}
