import { createServer, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import {
    ClientMessage,
    LIVE_CLOSE_CODES,
    LiveResult,
    ServerMessage,
} from '../../src/openrider/live/protocol';
import { parseClientMessage } from '../../src/openrider/live/protocol-parse';
import { RunLog } from '../../src/openrider/live/run-log';
import type { TrackEdit, TrackSnapshot } from '../../src/openrider/edit/track-edit';
import { LiveToken, LiveTrack, readToken, signPayload, trackKey } from './token';
import type { Verdict, VerifyInput } from './verifier';

/**
 * Best run of a rider: its time in ticks, and its distance in whole meters in endurance, and
 * whether the rider retired it there.
 */
interface BestRun {
    time: number;
    distance: number | null;
    retired: boolean;
}

/** Whether a run beats another: further in whole meters, else as far and faster. */
function beats(run: BestRun, best: BestRun | null): boolean {
    if (best === null) {
        return true;
    }
    const further = (run.distance ?? 0) - (best.distance ?? 0);
    return further > 0 || (further === 0 && run.time < best.time);
}

/** Limits of the server, against riders keeping it busy. */
export interface LiveLimits {
    /** Riders connected at once in a session. */
    ridersPerSession: number;
    /** Sessions at once. */
    sessions: number;
    /** Size of a message, in bytes. */
    messageBytes: number;
    /** Size of a whole track sent by an editor, in bytes. */
    snapshotBytes: number;
    /** Edits kept since the last whole track, before asking for a new one. */
    compactEdits: number;
    /** Edits kept at most since the last whole track. */
    maxEdits: number;
    /** Messages a rider can send in a burst, then per second. */
    messageBurst: number;
    messagesPerSecond: number;
    /** Inputs kept for the run of a rider (see {@link RunLog}). */
    runInputs: number;
    /** Longest run verified, in physics ticks. */
    finishTicks: number;
    /** Time a session without rider is kept, with its results, in milliseconds. */
    emptySessionTtl: number;
    /** Time between two checks of the connections and the sessions, in milliseconds. */
    sweepInterval: number;
}

export const DEFAULT_LIVE_LIMITS: LiveLimits = {
    ridersPerSession: 8,
    sessions: 500,
    messageBytes: 256 * 1024,
    snapshotBytes: 16 * 1024 * 1024,
    compactEdits: 1000,
    maxEdits: 20000,
    messageBurst: 60,
    messagesPerSecond: 30,
    // An hour of a rider pressing a key every two ticks
    runInputs: 90_000,
    // Half an hour
    finishTicks: 30 * 60 * 50,
    emptySessionTtl: 10 * 60 * 1000,
    sweepInterval: 30 * 1000,
};

export interface LiveServerOptions {
    /** Secret the site signs the tokens with. */
    secret: string;
    /** Code of a published track, by id. */
    loadTrackCode(trackId: number): Promise<string>;
    /** Verifies a run finishing a track, see `createVerifier`. */
    verify(input: VerifyInput): Promise<Verdict>;
    limits?: Partial<LiveLimits>;
    /** Current time in milliseconds, `Date.now` by default. */
    now?: () => number;
    /** Logs the errors of the server, `console.error` by default. */
    log?: (message: string) => void;
}

/** Rider of a session, kept with their best time once they left. */
interface Rider {
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
interface EditState {
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

/** Time the credits of an editing session can be used to upload its track, in seconds. */
const CREDITS_TTL = 12 * 60 * 60;

interface Session {
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

/** Connection state, see {@link LiveServer.sweep}. */
interface Connection {
    alive: boolean;
    /** Messages the rider can still send right now, refilled over time. */
    allowance: number;
    lastMessage: number;
}

/**
 * Session server of the live races: riders racing the same track at the same time, each seeing
 * the others ride (see `src/openrider/live/protocol.ts` for the messages).
 *
 * Riders connect over a WebSocket with a token of the site (see {@link LiveToken}), on any path:
 * `ws://host:port/?token=…`. The server keeps the sessions in memory: the run of each rider, to
 * send it whole to the riders joining, and the best time of each one, verified by replaying it.
 * A session without rider is forgotten after a while. `GET /health` answers `ok`, e.g. for a
 * process manager.
 */
export class LiveServer {
    private readonly http: Server;
    private readonly sockets: WebSocketServer;
    private readonly sessions = new Map<string, Session>();
    private readonly connections = new WeakMap<WebSocket, Connection>();
    private readonly limits: LiveLimits;
    private readonly now: () => number;
    private readonly log: (message: string) => void;
    private sweeper: ReturnType<typeof setInterval> | null = null;

    public constructor(private readonly options: LiveServerOptions) {
        this.limits = { ...DEFAULT_LIVE_LIMITS, ...options.limits };
        this.now = options.now ?? Date.now;
        this.log = options.log ?? ((message) => console.error(message));

        this.http = createServer((request, response) => {
            const healthy = request.method === 'GET' && request.url === '/health';
            response.writeHead(healthy ? 200 : 404, { 'Content-Type': 'text/plain' });
            response.end(healthy ? 'ok' : 'Not found');
        });
        this.sockets = new WebSocketServer({
            noServer: true,
            // The whole tracks of the editors only, see receive
            maxPayload: Math.max(this.limits.messageBytes, this.limits.snapshotBytes),
        });
        this.http.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
            this.sockets.handleUpgrade(request, socket, head, (ws) => this.connect(ws, request));
        });
    }

    /** Sessions in memory, with their connected riders. */
    public get stats(): { sessions: number; riders: number } {
        let riders = 0;
        this.sessions.forEach((session) => (riders += this.connected(session).length));
        return { sessions: this.sessions.size, riders };
    }

    /** Starts listening, on a free port when 0, returning the port. */
    public async listen(port: number, host = '127.0.0.1'): Promise<number> {
        await new Promise<void>((resolve, reject) => {
            this.http.once('error', reject);
            this.http.listen(port, host, () => resolve());
        });
        this.sweeper = setInterval(() => this.sweep(), this.limits.sweepInterval);
        return (this.http.address() as AddressInfo).port;
    }

    /** Closes every connection and stops listening. */
    public async close(): Promise<void> {
        if (this.sweeper) {
            clearInterval(this.sweeper);
        }
        this.sockets.clients.forEach((socket) => socket.terminate());
        await new Promise<void>((resolve) => this.http.close(() => resolve()));
    }

    /**
     * Pings the riders, closing the connections that did not answer the last ping, and forgets
     * the sessions without rider for too long.
     */
    public sweep(): void {
        this.sockets.clients.forEach((socket) => {
            const connection = this.connections.get(socket);
            if (connection && !connection.alive) {
                socket.terminate();
                return;
            }
            if (connection) {
                connection.alive = false;
            }
            socket.ping();
        });

        const now = this.now();
        this.sessions.forEach((session, id) => {
            if (
                session.emptySince !== null &&
                now - session.emptySince > this.limits.emptySessionTtl
            ) {
                this.sessions.delete(id);
            }
        });
    }

    private connect(socket: WebSocket, request: IncomingMessage): void {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const token = readToken(
            url.searchParams.get('token') ?? '',
            this.options.secret,
            this.now() / 1000,
        );
        if (!token) {
            socket.close(LIVE_CLOSE_CODES.INVALID_TOKEN, 'Invalid or expired token');
            return;
        }

        const session = this.sessionOf(token);
        if (!session) {
            socket.close(LIVE_CLOSE_CODES.SERVER_FULL, 'Too many live sessions, try again later');
            return;
        }
        if (trackKey(session.track) !== trackKey(token.track)) {
            socket.close(LIVE_CLOSE_CODES.INVALID_TOKEN, 'The session races another track');
            return;
        }
        if (session.edit && !token.rider.startsWith('u')) {
            socket.close(LIVE_CLOSE_CODES.INVALID_TOKEN, 'Log in to edit the track together');
            return;
        }

        const known = session.riders.get(token.rider);
        if (known?.socket) {
            known.socket.close(LIVE_CLOSE_CODES.REPLACED, 'Joined the session from somewhere else');
        } else if (this.connected(session).length >= this.limits.ridersPerSession) {
            socket.close(LIVE_CLOSE_CODES.SESSION_FULL, 'The session is full');
            return;
        }

        // A rider joining again keeps their best time, their run being sent again
        const rider: Rider = known ?? {
            id: token.rider,
            name: token.name,
            socket: null,
            run: new RunLog(),
            best: null,
            verifying: false,
        };
        rider.name = token.name;
        rider.socket = socket;
        rider.run = new RunLog();
        session.riders.set(rider.id, rider);
        session.emptySince = null;

        this.connections.set(socket, {
            alive: true,
            allowance: this.limits.messageBurst,
            lastMessage: this.now(),
        });
        socket.on('pong', () => {
            const connection = this.connections.get(socket);
            if (connection) {
                connection.alive = true;
            }
        });
        socket.on('message', (data, isBinary) =>
            this.receive(session, rider, socket, data, isBinary),
        );
        socket.on('close', () => this.leave(session, rider, socket));
        socket.on('error', (error) => this.log(`Live session ${session.id}: ${error.message}`));

        const you = { id: rider.id, name: rider.name };
        const edit = session.edit;
        // The first editor gives the track, the others waiting for it
        const provide = edit !== null && edit.snapshot === null && !edit.provider?.socket;
        if (edit && provide) {
            edit.provider = rider;
        }
        this.send(socket, {
            type: 'welcome',
            you,
            riders: this.connected(session)
                .filter((other) => other !== rider)
                .map(({ id, name, run }) => ({ id, name, events: run.resync() })),
            results: this.results(session),
            ...(edit && {
                editor: {
                    prefix: `${rider.id}.${edit.screens++}.`,
                    snapshot: edit.snapshot,
                    seq: edit.snapshotSeq,
                    edits: edit.log,
                    provide,
                    host: edit.host ?? (provide ? rider.id : null),
                },
            }),
        });
        if (edit?.authors.size) {
            this.send(socket, { type: 'credits', token: this.credits(session, edit) });
        }
        this.broadcast(session, { type: 'joined', rider: you }, rider);
        this.broadcastResults(session);
    }

    /** The session of a token, created if needed, null when the server has too many. */
    private sessionOf(token: LiveToken): Session | null {
        let session = this.sessions.get(token.session);
        if (!session) {
            if (this.sessions.size >= this.limits.sessions) {
                return null;
            }
            session = {
                id: token.session,
                edit:
                    token.track === 'edit'
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
                track: token.track,
                riders: new Map(),
                trackCode: null,
                emptySince: null,
            };
            this.sessions.set(session.id, session);
        }
        return session;
    }

    private receive(
        session: Session,
        rider: Rider,
        socket: WebSocket,
        data: RawData,
        isBinary: boolean,
    ): void {
        if (rider.socket !== socket) {
            return;
        }
        if (!this.allow(socket)) {
            socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'Too many messages');
            return;
        }
        // Only the editor asked for the whole track sends a large message
        const size = Array.isArray(data)
            ? data.reduce((total, part) => total + part.length, 0)
            : data.byteLength;
        if (size > this.limits.messageBytes && session.edit?.provider !== rider) {
            socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'Message too large');
            return;
        }
        const message = isBinary ? null : parseClientMessage(data.toString());
        if (!message) {
            socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'Invalid message');
            return;
        }
        this.handle(session, rider, socket, message);
    }

    private handle(
        session: Session,
        rider: Rider,
        socket: WebSocket,
        message: ClientMessage,
    ): void {
        const edit = session.edit;
        if (['edits', 'snapshot', 'cursor'].includes(message.type)) {
            if (edit) {
                this.handleEdit(session, edit, rider, socket, message);
            } else {
                socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'Not an editing session');
            }
            return;
        }
        switch (message.type) {
            case 'run':
                rider.run.apply(message.events);
                if (rider.run.size > this.limits.runInputs) {
                    socket.close(LIVE_CLOSE_CODES.BAD_MESSAGE, 'The run is too long');
                    return;
                }
                this.broadcast(
                    session,
                    { type: 'run', rider: rider.id, events: message.events },
                    rider,
                );
                break;
            case 'finish':
                void this.finish(session, rider, socket, message.ghostString, message.time);
                break;
            case 'resync': {
                const other = session.riders.get(message.rider);
                if (other?.socket) {
                    this.send(socket, {
                        type: 'run',
                        rider: other.id,
                        events: other.run.resync(),
                        resync: true,
                    });
                }
                break;
            }
        }
    }

    /** Handles the messages of an editor: edits, whole tracks and cursor. */
    private handleEdit(
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
                this.broadcast(session, {
                    type: 'edits',
                    rider: rider.id,
                    first,
                    edits: message.edits,
                });

                if (!edit.authors.has(rider.id)) {
                    edit.authors.set(rider.id, rider.name);
                    this.broadcast(session, {
                        type: 'credits',
                        token: this.credits(session, edit),
                    });
                }
                // Starting again from a new whole track, rather than from many edits
                if (edit.log.length >= this.limits.compactEdits && !edit.provider?.socket) {
                    edit.provider = rider;
                    this.send(socket, { type: 'snapshotRequest' });
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
                    this.broadcast(
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
                        this.broadcast(session, {
                            type: 'credits',
                            token: this.credits(session, edit),
                        });
                    }
                }
                break;
            }
            case 'cursor':
                this.broadcast(
                    session,
                    { type: 'cursor', rider: rider.id, pos: message.pos },
                    rider,
                );
                break;
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
            this.options.secret,
        );
    }

    /**
     * Verifies a run finishing the track, or falling on an endurance track, keeping it as the best
     * run of the rider if it is.
     */
    private async finish(
        session: Session,
        rider: Rider,
        socket: WebSocket,
        ghostString: string,
        time: number,
    ): Promise<void> {
        // One run at a time: the player finishes again only after riding the track again
        if (rider.verifying) {
            return;
        }
        if (time > this.limits.finishTicks) {
            this.send(socket, { type: 'refused', reason: 'The run is too long to be verified' });
            return;
        }

        rider.verifying = true;
        let verdict: Verdict;
        try {
            verdict = await this.options.verify({
                ghostString,
                time,
                ...(await this.trackOf(session)),
            });
        } catch (error) {
            // Downloaded again for the next run
            session.trackCode = null;
            this.log(`Live session ${session.id}: ${(error as Error).message}`);
            verdict = { valid: false, reason: 'The run could not be verified, try again later' };
        } finally {
            rider.verifying = false;
        }

        if (!verdict.valid) {
            this.send(socket, { type: 'refused', reason: verdict.reason });
            return;
        }
        const run: BestRun = {
            time,
            distance: verdict.distance === undefined ? null : Math.floor(verdict.distance),
            retired: verdict.retired === true,
        };
        this.send(socket, {
            type: 'finished',
            time,
            ...(run.distance === null ? {} : { distance: run.distance }),
            ...(run.retired ? { retired: true } : {}),
        });
        if (beats(run, rider.best)) {
            rider.best = run;
            this.broadcastResults(session);
        }
    }

    /** What the verifier replays the runs of a session on: a track code, or a seed. */
    private async trackOf(
        session: Session,
    ): Promise<{ trackCode: string } | { seed: number; version: number }> {
        const track = session.track;
        if (track === 'edit') {
            throw new Error('An editing session has no track to verify the runs on');
        }
        if (typeof track !== 'number') {
            return { seed: track.seed, version: track.version };
        }
        session.trackCode ??= this.options.loadTrackCode(track);
        return { trackCode: await session.trackCode };
    }

    private leave(session: Session, rider: Rider, socket: WebSocket): void {
        // Replaced by a new connection of the same rider
        if (rider.socket !== socket) {
            return;
        }
        rider.socket = null;
        rider.run = new RunLog();
        this.broadcast(session, { type: 'left', rider: rider.id });
        this.broadcastResults(session);

        // The track asked of the editor leaving is asked of another one
        const edit = session.edit;
        if (edit?.provider === rider) {
            edit.provider = this.connected(session)[0] ?? null;
            edit.provider?.socket?.send(JSON.stringify({ type: 'snapshotRequest' }));
        }
        if (!this.connected(session).length) {
            session.emptySince = this.now();
        }
    }

    /** Whether a rider may send a message now, refilling their allowance over time. */
    private allow(socket: WebSocket): boolean {
        const connection = this.connections.get(socket);
        if (!connection) {
            return false;
        }
        const now = this.now();
        connection.allowance = Math.min(
            this.limits.messageBurst,
            connection.allowance +
                ((now - connection.lastMessage) / 1000) * this.limits.messagesPerSecond,
        );
        connection.lastMessage = now;
        if (connection.allowance < 1) {
            return false;
        }
        connection.allowance--;
        return true;
    }

    private connected(session: Session): Rider[] {
        return [...session.riders.values()].filter((rider) => rider.socket);
    }

    /** Riders of the session, best run first (see {@link beats}), then those without, by name. */
    private results(session: Session): LiveResult[] {
        return [...session.riders.values()]
            .filter((rider) => rider.socket || rider.best !== null)
            .sort((a, b) => {
                if (a.best && b.best && beats(a.best, b.best) !== beats(b.best, a.best)) {
                    return beats(a.best, b.best) ? -1 : 1;
                }
                if (Boolean(a.best) !== Boolean(b.best)) {
                    return a.best ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            })
            .map(({ id, name, best, socket }) => ({
                id,
                name,
                best: best?.time ?? null,
                distance: best?.distance ?? null,
                retired: best?.retired ?? false,
                riding: socket !== null,
            }));
    }

    private broadcastResults(session: Session): void {
        this.broadcast(session, { type: 'results', results: this.results(session) });
    }

    /** Sends a message to the riders of the session, but the one given. */
    private broadcast(session: Session, message: ServerMessage, except?: Rider): void {
        const json = JSON.stringify(message);
        this.connected(session).forEach((rider) => {
            if (rider !== except) {
                rider.socket?.send(json);
            }
        });
    }

    private send(socket: WebSocket, message: ServerMessage): void {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
}
