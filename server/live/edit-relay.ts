import type { WebSocket } from 'ws';
import { ClientMessage, LIVE_CLOSE_CODES } from '../../src/openrider/live/protocol';
import type { LiveLimits } from './live-limits';
import {
    broadcast,
    connectedRiders,
    type EditState,
    type Rider,
    send,
    type Session,
} from './live-session';
import { signPayload } from './token';

/** Time the credits of an editing session can be used to upload its track, in seconds. */
const CREDITS_TTL = 12 * 60 * 60;

/** Messages of the editors, see {@link EditRelay.handle}. */
export const EDIT_MESSAGES: ReadonlyArray<ClientMessage['type']> = ['edits', 'snapshot', 'cursor'];

/**
 * Edition of the track of the editing sessions, for the live server: relays the edits of each
 * editor to every screen in one order, keeps the whole track with the edits since, asking an
 * editor for a new whole track once they pile up, and signs the credits of the editors for the
 * site.
 */
export class EditRelay {
    public constructor(
        private readonly limits: LiveLimits,
        private readonly secret: string,
        private readonly now: () => number,
    ) {}

    /**
     * Editing part of the welcome of a rider joining an editing session: the first editor gives
     * the track, the others waiting for it.
     */
    public welcome(edit: EditState, rider: Rider) {
        const provide = edit.snapshot === null && !edit.provider?.socket;
        if (provide) {
            edit.provider = rider;
        }
        return {
            prefix: `${rider.id}.${edit.screens++}.`,
            snapshot: edit.snapshot,
            seq: edit.snapshotSeq,
            edits: edit.log,
            provide,
            host: edit.host ?? (provide ? rider.id : null),
        };
    }

    /** Sends the credits of the session to a rider who joined, once someone edited the track. */
    public sendCredits(socket: WebSocket, session: Session, edit: EditState): void {
        if (edit.authors.size) {
            send(socket, { type: 'credits', token: this.credits(session, edit) });
        }
    }

    /** Handles the messages of an editor: edits, whole tracks and cursor. */
    public handle(
        session: Session,
        edit: EditState,
        rider: Rider,
        socket: WebSocket,
        message: ClientMessage,
    ): void {
        switch (message.type) {
            case 'edits': {
                if (edit.log.length + message.edits.length > this.limits.maxEdits) {
                    socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'Too many edits in the session');
                    return;
                }
                const first = edit.snapshotSeq + edit.log.length + 1;
                edit.log.push(...message.edits);
                // To every screen, its author too: each one applies the edits in that order
                broadcast(session, {
                    type: 'edits',
                    rider: rider.id,
                    first,
                    edits: message.edits,
                });

                if (!edit.authors.has(rider.id)) {
                    edit.authors.set(rider.id, rider.name);
                    broadcast(session, { type: 'credits', token: this.credits(session, edit) });
                }
                // Starting again from a new whole track, rather than from many edits
                if (edit.log.length >= this.limits.compactEdits && !edit.provider?.socket) {
                    edit.provider = rider;
                    send(socket, { type: 'snapshotRequest' });
                }
                break;
            }
            case 'snapshot': {
                const last = edit.snapshotSeq + edit.log.length;
                if (
                    edit.provider !== rider ||
                    message.seq < edit.snapshotSeq ||
                    message.seq > last
                ) {
                    return;
                }
                const first = edit.snapshot === null;
                edit.log = edit.log.slice(message.seq - edit.snapshotSeq);
                edit.snapshot = message.snapshot;
                edit.snapshotSeq = message.seq;
                edit.provider = null;
                if (first) {
                    // The editor giving the track is its main creator
                    edit.host = rider.id;
                    broadcast(
                        session,
                        {
                            type: 'snapshot',
                            seq: message.seq,
                            snapshot: message.snapshot,
                            host: rider.id,
                        },
                        rider,
                    );
                    if (edit.authors.size) {
                        broadcast(session, {
                            type: 'credits',
                            token: this.credits(session, edit),
                        });
                    }
                }
                break;
            }
            case 'cursor':
                broadcast(session, { type: 'cursor', rider: rider.id, pos: message.pos }, rider);
                break;
        }
    }

    /** Asks another editor for the whole track when the one asked for it left. */
    public left(session: Session, edit: EditState, rider: Rider): void {
        if (edit.provider === rider) {
            edit.provider = connectedRiders(session)[0] ?? null;
            edit.provider?.socket?.send(JSON.stringify({ type: 'snapshotRequest' }));
        }
    }

    /** The accounts that edited the track of a session, signed for the site. */
    private credits(session: Session, edit: EditState): string {
        return signPayload(
            {
                session: session.id,
                host: edit.host,
                authors: [...edit.authors.keys()],
                exp: Math.floor(this.now() / 1000) + CREDITS_TTL,
            },
            this.secret,
        );
    }
}
