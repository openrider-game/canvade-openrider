import type { TrackEdit, TrackSnapshot } from '../edit/track-edit';
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
 *
 * In an editing session, the editors of a track send their edits (`TrackEdit`) instead: the
 * server numbers them and sends them to everyone, their author included, every screen applying
 * them in that order. A screen joining gets the whole track and the edits since; the first one
 * gives the track it edits. The server also relays the cursors of the editors, and signs the list
 * of the accounts that edited the track, for the site to credit them (see {@link ServerMessage}).
 */

/** Rider of a live session. */
export interface LiveRider {
    /** Id of the rider in the session: the account, or a guest. */
    id: string;
    name: string;
}

/**
 * Best run of a rider of the session, see {@link ServerMessage}: the fastest on a published
 * track, the furthest on an endurance track, then the fastest at the same distance in whole
 * meters.
 */
export interface LiveResult extends LiveRider {
    /** Time of the best run, in physics ticks, null without one. */
    best: number | null;
    /** Distance of the best run in whole meters on an endurance track, else null. */
    distance: number | null;
    /** Whether the rider retired their best run, on an endurance track. */
    retired: boolean;
    /** Whether the rider is still in the session. */
    riding: boolean;
}

/** Message of a rider to the session server. */
export type ClientMessage =
    /** Events of the run of the player, in order. */
    | { type: 'run'; events: RunEvent[] }
    /**
     * The player finished the track, or fell on an endurance track: the ghost string of the run
     * and its time, in ticks.
     */
    | { type: 'finish'; ghostString: string; time: number }
    /** Asks for the whole run of a rider again, e.g. when its replay no longer matches it. */
    | { type: 'resync'; rider: string }
    /** Edits of the track made on this screen, in order. */
    | { type: 'edits'; edits: TrackEdit[] }
    /**
     * The whole track, with the number of the last edit applied to it: the track of the first
     * editor, or answering a `snapshotRequest`.
     */
    | { type: 'snapshot'; seq: number; snapshot: TrackSnapshot }
    /** Position of the cursor on the track, in world units, null when out of the track. */
    | { type: 'cursor'; pos: [number, number] | null };

/** Message of the session server to a rider. */
export type ServerMessage =
    /**
     * Sent once connected: the rider, the riders already there with their whole runs, and in an
     * editing session, what the screen edits (see {@link EditorWelcome}).
     */
    | {
          type: 'welcome';
          you: LiveRider;
          riders: Array<LiveRider & { events: RunEvent[] }>;
          results: LiveResult[];
          editor?: EditorWelcome;
      }
    /** A rider joined the session, their run following. */
    | { type: 'joined'; rider: LiveRider }
    /** A rider left the session. */
    | { type: 'left'; rider: string }
    /** Events of the run of a rider; the whole run when answering a resync. */
    | { type: 'run'; rider: string; events: RunEvent[]; resync?: true }
    /** Results of the session, sent whenever they change. */
    | { type: 'results'; results: LiveResult[] }
    /**
     * The run of the player finishing the track was verified: its time, and its distance in whole
     * meters on an endurance track; or why it was refused.
     */
    | { type: 'finished'; time: number; distance?: number; retired?: true }
    | { type: 'refused'; reason: string }
    /** Edits of an editor, numbered from `first` on, to apply in that order. */
    | { type: 'edits'; rider: string; first: number; edits: TrackEdit[] }
    /**
     * The whole track, given by the first editor, the host of the session, for the screens
     * waiting for it.
     */
    | { type: 'snapshot'; seq: number; snapshot: TrackSnapshot; host: string }
    /** Asks for the whole track, to start again from it instead of the edits so far. */
    | { type: 'snapshotRequest' }
    /** Cursor of an editor, null when out of the track. */
    | { type: 'cursor'; rider: string; pos: [number, number] | null }
    /**
     * The accounts that edited the track so far, signed for the site to credit them when the
     * host uploads the track: `<payload>.<signature>`, the payload
     * `{ "session", "host", "authors", "exp" }`.
     */
    | { type: 'credits'; token: string };

/** What a screen joining an editing session edits, see {@link ServerMessage}. */
export interface EditorWelcome {
    /** Prefix of the ids of the objects and layers this screen creates, unique in the session. */
    prefix: string;
    /** The whole track, null while the first editor has not given it. */
    snapshot: TrackSnapshot | null;
    /** Number of the last edit applied to the snapshot. */
    seq: number;
    /** Edits since the snapshot, in order, numbered from `seq + 1`. */
    edits: TrackEdit[];
    /** Whether this screen gives the track: the first one of the session. */
    provide: boolean;
    /**
     * Editor who gave the track to the session, its main creator: the only one exporting and
     * uploading it, the others who edited it being credited. Null while no one gave it.
     */
    host: string | null;
}

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

/** Limits of the edits read from untrusted JSON. */
export const EDIT_LIMITS = {
    /** Edits of a message. */
    edits: 500,
    /** Objects of an edit, groups included. */
    objects: 20000,
    /** Objects of a snapshot. */
    snapshotObjects: 500000,
    layers: 64,
    /** Groups in groups. */
    depth: 4,
    /** Length of an id, a name, a code. */
    uid: 80,
    name: 60,
    code: 4000,
} as const;
