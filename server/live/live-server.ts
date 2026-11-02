import { createServer, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { ClientMessage, LIVE_CLOSE_CODES } from '../../src/openrider/live/protocol';
import { parseClientMessage } from '../../src/openrider/live/protocol-parse';
import { RunLog } from '../../src/openrider/live/run-log';
import { EDIT_MESSAGES, EditRelay } from './edit-relay';
import { DEFAULT_LIVE_LIMITS, type LiveLimits } from './live-limits';
import {
    broadcast,
    connectedRiders,
    createSession,
    type Rider,
    send,
    type Session,
} from './live-session';
import { beats, broadcastResults, sessionResults, verifiedRun } from './race-results';
import { LiveToken, readToken, trackKey } from './token';
import type { Verdict, VerifyInput } from './verifier';

export { DEFAULT_LIVE_LIMITS, type LiveLimits } from './live-limits';

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
 * `ws://host:port/?token=…`. The server keeps the sessions in memory (see `live-session.ts`):
 * the run of each rider, to send it whole to the riders joining, and the best time of each one,
 * verified by replaying it (see `race-results.ts`). The editing sessions relay the edits of their
 * editors instead (see {@link EditRelay}). A session without rider is forgotten after a while.
 * `GET /health` answers `ok`, e.g. for a process manager.
 */
export class LiveServer {
    private readonly http: Server;
    private readonly sockets: WebSocketServer;
    private readonly sessions = new Map<string, Session>();
    private readonly connections = new WeakMap<WebSocket, Connection>();
    private readonly limits: LiveLimits;
    private readonly now: () => number;
    private readonly log: (message: string) => void;
    private readonly edits: EditRelay;
    private sweeper: ReturnType<typeof setInterval> | null = null;

    public constructor(private readonly options: LiveServerOptions) {
        this.limits = { ...DEFAULT_LIVE_LIMITS, ...options.limits };
        this.now = options.now ?? Date.now;
        this.log = options.log ?? ((message) => console.error(message));
        this.edits = new EditRelay(this.limits, options.secret, this.now);

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
        this.sessions.forEach((session) => (riders += connectedRiders(session).length));
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
        } else if (connectedRiders(session).length >= this.limits.ridersPerSession) {
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
        send(socket, {
            type: 'welcome',
            you,
            riders: connectedRiders(session)
                .filter((other) => other !== rider)
                .map(({ id, name, run }) => ({ id, name, events: run.resync() })),
            results: sessionResults(session),
            ...(edit && { editor: this.edits.welcome(edit, rider) }),
        });
        if (edit) {
            this.edits.sendCredits(socket, session, edit);
        }
        broadcast(session, { type: 'joined', rider: you }, rider);
        broadcastResults(session);
    }

    /** The session of a token, created if needed, null when the server has too many. */
    private sessionOf(token: LiveToken): Session | null {
        let session = this.sessions.get(token.session);
        if (!session) {
            if (this.sessions.size >= this.limits.sessions) {
                return null;
            }
            session = createSession(token.session, token.track);
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
        if (EDIT_MESSAGES.includes(message.type)) {
            if (session.edit) {
                this.edits.handle(session, session.edit, rider, socket, message);
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
                broadcast(session, { type: 'run', rider: rider.id, events: message.events }, rider);
                break;
            case 'finish':
                void this.finish(session, rider, socket, message.ghostString, message.time);
                break;
            case 'resync': {
                const other = session.riders.get(message.rider);
                if (other?.socket) {
                    send(socket, {
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
            send(socket, { type: 'refused', reason: 'The run is too long to be verified' });
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
            send(socket, { type: 'refused', reason: verdict.reason });
            return;
        }
        const run = verifiedRun(time, verdict);
        send(socket, {
            type: 'finished',
            time,
            ...(run.distance === null ? {} : { distance: run.distance }),
            ...(run.retired ? { retired: true } : {}),
        });
        if (beats(run, rider.best)) {
            rider.best = run;
            broadcastResults(session);
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
        broadcast(session, { type: 'left', rider: rider.id });
        broadcastResults(session);

        // The track asked of the editor leaving is asked of another one
        if (session.edit) {
            this.edits.left(session, session.edit, rider);
        }
        if (!connectedRiders(session).length) {
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
}
