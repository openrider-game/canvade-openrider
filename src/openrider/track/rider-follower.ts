import type { ReplayRunner } from '../bike/runner/replay-runner';
import type { Entity } from '../entity/entity';
import type { Track } from './track';

/** Rider the camera follows other than the player: a rider of the live session, or a ghost. */
export type FollowedRider = { kind: 'remote'; id: string } | { kind: 'ghost'; id: number };

/**
 * Rider the camera of a track follows, by setting its focal point (`Track.focalPoint`): the
 * player, a ghost, or a rider of the live session.
 */
export class RiderFollower {
    /** Rider the camera follows, see {@link RiderFollower.follow}. */
    private rider: FollowedRider | null = null;
    /** Bike part of the followed rider the camera was last given. */
    private point: Entity | null = null;

    public constructor(private readonly track: Track) {}

    /** Rider the camera follows other than the player, null when none. */
    public get followed(): FollowedRider | null {
        return this.rider;
    }

    /** Runner of a followed rider, undefined once gone (left the session, ghost removed). */
    public runnerOf(rider: FollowedRider): ReplayRunner | undefined {
        return rider.kind === 'remote'
            ? this.track.remoteRunners.get(rider.id)
            : this.track.ghostRunners.get(rider.id);
    }

    /**
     * Follows a rider with the camera, whatever bike they ride: their bike changes whenever they
     * start over, and the runner of a rider of the live session when their run is sent again.
     * The camera follows the player again with null, or when the rider is gone.
     *
     * Following stops as soon as something else moves the camera: the player riding (see
     * `PlayerRunner`), or the camera being dragged.
     */
    public follow(rider: FollowedRider | null): void {
        this.rider = rider;
        this.point = null;
        if (rider) {
            this.refresh();
        } else {
            this.track.focalPoint = this.track.playerRunner.instance?.hitbox ?? null;
        }
    }

    /** Points the camera at the current bike of the followed rider, on each frame. */
    public refresh(): void {
        const rider = this.rider;
        if (!rider) {
            return;
        }
        // Something else moved the camera
        if (this.point !== null && this.track.focalPoint !== this.point) {
            this.rider = null;
            this.point = null;
            return;
        }

        const runner = this.runnerOf(rider);
        if (!runner) {
            this.follow(null);
            return;
        }
        // An exploded bike is gone: the camera stays where it was
        const point = runner.instance?.hitbox ?? this.point;
        this.track.focalPoint = this.point = point;
    }

    /**
     * Focuses the camera on the player, or on the first ghost if the player has not reached any
     * checkpoint, to watch the best run: the player takes the camera back by riding (see
     * `PlayerRunner`). The endurance mode, without checkpoints, follows the first ghost until
     * then on each start.
     *
     * A rider of the live session followed stays followed: they ride on whatever the player does.
     */
    public reset(): void {
        if (this.rider?.kind === 'remote') {
            this.refresh();
            return;
        }
        this.rider = null;
        this.point = null;

        const track = this.track;
        let focalPoint = track.playerRunner.instance?.hitbox ?? null;
        if (!track.playerRunner.snapshots.length && track.ghostRunners.size) {
            const firstGhost = track.ghostRunners.values().next().value;
            focalPoint = firstGhost?.instance?.hitbox ?? focalPoint;
        }

        track.focalPoint = focalPoint;
        if (focalPoint) {
            track.camera.set(focalPoint.displayPos);
        }
    }
}
