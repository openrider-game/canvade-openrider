import { WebSocket } from 'ws';
import type { TrackEdit, TrackSnapshot } from '../../src/openrider/edit/track-edit';
import type { ServerMessage } from '../../src/openrider/live/protocol';
import type { RunLog } from '../../src/openrider/live/run-log';
import type { BestRun } from './race-results';
import type { LiveTrack } from './token';

/** Rider of a session, kept with their best time once they left. */
export interface Rider {
    id: string;
    name: string;
    /** Connection of the rider, null once they left. */
    socket: WebSocket | null;
    run: RunLog;
    best: BestRun | null;
    /** Whether a run of the rider is being verified. */
    verifying: boolean;
}

/** Edition of the track of an editing session, see `EditorWelcome`. */
export interface EditState {
    /** The whole track, null until the first editor gives it. */
    snapshot: TrackSnapshot | null;
    /** Number of the last edit applied to the snapshot. */
    snapshotSeq: number;
    /** Edits since the snapshot, the first one numbered `snapshotSeq + 1`. */
    log: TrackEdit[];
    /** Screens that joined, numbering the prefixes of their ids. */
    screens: number;
    /** Editor asked for the whole track, null when none is. */
    provider: Rider | null;
    /** Editor who gave the track to the session, its main creator, null until then. */
    host: string | null;
    /** Names of the accounts that edited the track, by rider id. */
    authors: Map<string, string>;
}

/** Session of the live server: riders racing, or editing, the same track. */
export interface Session {
    id: string;
    /** Edition of the track, in an editing session. */
    edit: EditState | null;
    /** Track of the session: a published one, or an endurance track (see {@link LiveTrack}). */
    track: LiveTrack;
    riders: Map<string, Rider>;
    /** Code of the published track, downloaded for the first run to verify. */
    trackCode: Promise<string> | null;
    /** Time the last rider left at, null while riders are connected. */
    emptySince: number | null;
}

/** A new session, of an editing session for the `edit` track. */
export function createSession(id: string, track: LiveTrack): Session {
    return {
        id,
        edit:
            track === 'edit'
                ? {
                      snapshot: null,
                      snapshotSeq: 0,
                      log: [],
                      screens: 0,
                      provider: null,
                      host: null,
                      authors: new Map(),
                  }
                : null,
        track,
        riders: new Map(),
        trackCode: null,
        emptySince: null,
    };
}

/** Riders of a session connected right now. */
export function connectedRiders(session: Session): Rider[] {
    return [...session.riders.values()].filter((rider) => rider.socket);
}

/** Sends a message to a connection, if still open. */
export function send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

/** Sends a message to the riders of a session, but the one given. */
export function broadcast(session: Session, message: ServerMessage, except?: Rider): void {
    const json = JSON.stringify(message);
    connectedRiders(session).forEach((rider) => {
        if (rider !== except) {
            rider.socket?.send(json);
        }
    });
}
