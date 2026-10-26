import { CONTROL_NAMES, ControlName } from '../bike/runner/runner-controls';
import type { RunEvent } from './run-events';

/**
 * Messages of the live sessions, as JSON over a WebSocket between the game and the session
 * server (see `server/live` and the "Live sessions" part of `backend/README.md`).
 *
 * A rider connects with the token the site gives them for a session (`?token=`), then sends the
 * whole run of the player first (`RunReporter.resync`), and the events of the run as it goes on
 * (`RunReporter.flush`). The server relays the run of each rider to the others, sends the whole
 * runs of the riders already there to a rider joining, and verifies the runs finishing the track
 * for the results of the session.
 */

/** Rider of a live session. */
export interface LiveRider {
    /** Id of the rider in the session: the account, or a guest. */
    id: string;
    name: string;
}

/** Best time of a rider of the session, see {@link ServerMessage}. */
export interface LiveResult extends LiveRider {
    /** Best time of the runs finishing the track, in physics ticks, null without one. */
    best: number | null;
    /** Whether the rider is still in the session. */
    riding: boolean;
}

/** Message of a rider to the session server. */
export type ClientMessage =
    /** Events of the run of the player, in order. */
    | { type: 'run'; events: RunEvent[] }
    /** The player finished the track: the ghost string of the run and its time, in ticks. */
    | { type: 'finish'; ghostString: string; time: number }
    /** Asks for the whole run of a rider again, e.g. when its replay no longer matches it. */
    | { type: 'resync'; rider: string };

/** Message of the session server to a rider. */
export type ServerMessage =
    /** Sent once connected: the rider, the riders already there with their whole runs. */
    | {
          type: 'welcome';
          you: LiveRider;
          riders: Array<LiveRider & { events: RunEvent[] }>;
          results: LiveResult[];
      }
    /** A rider joined the session, their run following. */
    | { type: 'joined'; rider: LiveRider }
    /** A rider left the session. */
    | { type: 'left'; rider: string }
    /** Events of the run of a rider; the whole run when answering a resync. */
    | { type: 'run'; rider: string; events: RunEvent[]; resync?: true }
    /** Results of the session, sent whenever they change. */
    | { type: 'results'; results: LiveResult[] }
    /** The run of the player finishing the track was verified: its time, or why it was refused. */
    | { type: 'finished'; time: number }
    | { type: 'refused'; reason: string };

/**
 * Close codes of the session server, after the standard ones: the reason is given with the
 * close event.
 */
export const LIVE_CLOSE_CODES = {
    /** The token is missing, invalid or expired. */
    INVALID_TOKEN: 4001,
    /** The session has as many riders as it can take. */
    SESSION_FULL: 4002,
    /** The server has as many sessions as it can take. */
    SERVER_FULL: 4003,
    /** A message cannot be read, or breaks the limits of the server. */
    BAD_MESSAGE: 4008,
    /** The same rider connected again, e.g. in another tab. */
    REPLACED: 4009,
} as const;

/** Most events of a message: a minute of a rider pressing a key on every tick. */
export const MAX_EVENTS_PER_MESSAGE = 3000;

/**
 * Name of a bike, as in the track codes (`BIKE_MAP`, not imported here to keep the bikes out of
 * the session server): a remote runner rides an unknown one with the default bike.
 */
const BIKE_NAME = /^[A-Za-z]{1,8}$/;

function isTime(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2 ** 31;
}

/** Reads the events of a run from untrusted JSON, null when one of them is invalid. */
export function parseRunEvents(value: unknown): RunEvent[] | null {
    if (!Array.isArray(value) || value.length > MAX_EVENTS_PER_MESSAGE) {
        return null;
    }
    const events: RunEvent[] = [];
    for (const item of value as Array<Record<string, unknown> | null>) {
        const time = item?.time;
        if (!isTime(time)) {
            return null;
        }
        if (item?.type === 'start') {
            const { checkpoints, bike } = item;
            if (!isTime(checkpoints) || typeof bike !== 'string' || !BIKE_NAME.test(bike)) {
                return null;
            }
            events.push({ type: 'start', time, checkpoints, bike });
        } else if (item?.type === 'toggle') {
            const control = item.control as ControlName;
            if (!CONTROL_NAMES.includes(control)) {
                return null;
            }
            events.push({ type: 'toggle', time, control });
        } else if (item?.type === 'progress') {
            events.push({ type: 'progress', time });
        } else {
            return null;
        }
    }
    return events;
}

/** Reads a message of a rider from untrusted JSON, null when it is invalid. */
export function parseClientMessage(json: string): ClientMessage | null {
    let message: Record<string, unknown> | null;
    try {
        message = JSON.parse(json) as Record<string, unknown> | null;
    } catch {
        return null;
    }

    switch (message?.type) {
        case 'run': {
            const events = parseRunEvents(message.events);
            return events && { type: 'run', events };
        }
        case 'finish': {
            const { ghostString, time } = message;
            return typeof ghostString === 'string' && isTime(time)
                ? { type: 'finish', ghostString, time }
                : null;
        }
        case 'resync':
            return typeof message.rider === 'string'
                ? { type: 'resync', rider: message.rider }
                : null;
        default:
            return null;
    }
}
