import type { ControlName } from '../bike/runner/runner-controls';

/**
 * What a rider of a live session tells the others about their run, in order: sent by a
 * `RunReporter` from the player, replayed by a `RemoteRunner` for each other rider.
 *
 * A run is made of attempts, one per start: from the start of the track, or from a checkpoint
 * kept from the attempts before. The physics being deterministic, the inputs are enough to
 * replay it: the runner hits the same checkpoints at the same times.
 */
export type RunEvent =
    /**
     * A new attempt: from the start of the track without checkpoint, else from the last one kept
     * (cancelled checkpoints, a new bike or new ghosts dropping some or all of them).
     */
    | {
          type: 'start';
          /** Time the attempt starts at, in physics ticks: the one of its checkpoint, or 0. */
          time: number;
          /** Checkpoints kept from the attempts before. */
          checkpoints: number;
          /** Name of the bike (see `BIKE_MAP`). */
          bike: string;
      }
    /** A control of the attempt toggled, on the given tick. */
    | { type: 'toggle'; time: number; control: ControlName }
    /** Every input of the attempt before the given tick was sent. */
    | { type: 'progress'; time: number }
    /**
     * The rider retired the attempt after the given tick: their run ends there, alive (see
     * `EnduranceRider.retire`).
     */
    | { type: 'retire'; time: number };
