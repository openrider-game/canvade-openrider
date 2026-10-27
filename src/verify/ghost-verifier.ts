import { GhostRunner } from '../openrider/bike/runner/ghost-runner';
import { EnduranceCourse } from '../openrider/endurance/endurance-course';
import { GhostParser } from '../openrider/parser/ghost-parser';
import { TrackParser } from '../openrider/parser/track-parser';
import { Track } from '../openrider/track/track';

/** Verdict on a ghost, see {@link GhostVerifier.verify}. */
export interface GhostVerdict {
    valid: boolean;
    /** Why the ghost is refused, empty when it is valid. */
    reason: string;
}

/** Verdict on a run of the endurance mode, see {@link GhostVerifier.verifyEndurance}. */
export interface EnduranceVerdict extends GhostVerdict {
    /** Distance of the run in meters, 0 when refused. */
    distance: number;
    /** Whether the valid run was retired by the rider rather than ended by a crash. */
    retired?: boolean;
}

/** Limits of a verification, against tracks and ghosts made to keep the server busy. */
export interface VerifyLimits {
    /** Longest run replayed, in physics ticks. */
    maxTicks: number;
    /** Time after which the verification gives up, as a `Date.now()` timestamp. */
    deadline: number;
}

/**
 * Checks a ghost by replaying it, for the backend to refuse forged times.
 *
 * The physics is deterministic: replayed from the start of the track, a recorded run reaches
 * every target exactly at the time it was recorded with, as the ghosts racing in the game do.
 * A ghost string edited by hand, or a time claimed apart from it, does not.
 */
export abstract class GhostVerifier {
    /**
     * Replays a ghost on a track.
     *
     * @param trackCode - Code of the published track.
     * @param ghostString - Ghost string of the run, see {@link GhostParser}.
     * @param time - Time claimed for the run, in physics ticks.
     */
    public static verify(
        trackCode: string,
        ghostString: string,
        time: number,
        limits: VerifyLimits,
    ): GhostVerdict {
        if (GhostParser.parse(ghostString).time !== time) {
            return GhostVerifier.refuse('The time differs from the one of the ghost string');
        }
        if (time > limits.maxTicks) {
            return GhostVerifier.refuse('The run is too long to be verified');
        }

        const track = GhostVerifier.parseTrack(trackCode, limits.deadline);
        if (track.targets.size === 0) {
            return GhostVerifier.refuse('The track has no target');
        }

        const ghost = new GhostRunner(track, ghostString, false);
        ghost.createBike();
        ghost.startFrom();

        // Runs the ticks as the play states do, until the ghost reaches every target
        while (!ghost.done && ghost.time < time) {
            ghost.fixedUpdate();

            if (ghost.time % 1000 === 0 && Date.now() > limits.deadline) {
                return GhostVerifier.refuse('The verification took too long');
            }
        }

        if (!ghost.done) {
            return GhostVerifier.refuse('The ghost does not reach every target');
        }
        if (ghost.time !== time) {
            return GhostVerifier.refuse(`The ghost finishes at another time: tick ${ghost.time}`);
        }

        return { valid: true, reason: '' };
    }

    /**
     * Replays a run of the endurance mode on the track of its seed, as the endurance state runs
     * it, until the rider falls, or retires: a rider alive past the time of the run retired there
     * (see `EnduranceRider`).
     *
     * @param seed - Seed of the generated track.
     * @param version - Version of the generator of the track.
     * @param ghostString - Ghost string of the run, its time being the last tick alive.
     * @param time - Time claimed for the run, in physics ticks.
     * @returns The verdict, with the distance of the run in meters when it is valid.
     */
    public static verifyEndurance(
        seed: number,
        version: number,
        ghostString: string,
        time: number,
        limits: VerifyLimits,
    ): EnduranceVerdict {
        if (GhostParser.parse(ghostString).time !== time) {
            return {
                ...GhostVerifier.refuse('The time differs from the one of the ghost string'),
                distance: 0,
            };
        }
        if (time > limits.maxTicks) {
            return { ...GhostVerifier.refuse('The run is too long to be verified'), distance: 0 };
        }

        const track = new Track(null);
        const course = new EnduranceCourse(track, seed, version);
        const ghost = new GhostRunner(track, ghostString, false);
        ghost.createBike();
        ghost.startFrom();
        track.ghostRunners.set(0, ghost);

        // Runs the ticks as the endurance state does: the physics, then the course
        let rider = null;
        while (!rider?.over && ghost.time <= time) {
            ghost.fixedUpdate();
            course.step();
            rider = course.riderOf(ghost);

            if (ghost.time % 1000 === 0 && Date.now() > limits.deadline) {
                return { ...GhostVerifier.refuse('The verification took too long'), distance: 0 };
            }
        }

        if (!rider?.over) {
            return {
                ...GhostVerifier.refuse('The rider does not fall at the time of the run'),
                distance: 0,
            };
        }
        if (rider.time !== time) {
            return {
                ...GhostVerifier.refuse(`The rider falls at another time: tick ${rider.time}`),
                distance: 0,
            };
        }

        return { valid: true, reason: '', distance: rider.distance, retired: rider.retired };
    }

    /**
     * Parses a track completely, as the parser state does over several frames.
     *
     * @throws When the track code cannot be parsed, or the deadline is passed.
     */
    private static parseTrack(trackCode: string, deadline: number): Track {
        const track = new Track(null);
        const parser = new TrackParser(track);
        parser.init(trackCode);

        while (!parser.done) {
            if (Date.now() > deadline) {
                throw new Error('The track took too long to parse');
            }
            parser.currentStep();
        }

        return track;
    }

    private static refuse(reason: string): GhostVerdict {
        return { valid: false, reason };
    }
}
