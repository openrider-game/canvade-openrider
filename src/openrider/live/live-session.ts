import { RemoteRunner } from '../bike/runner/remote-runner';
import type { Track } from '../track/track';
import { ClientMessage, LIVE_CLOSE_CODES, LiveResult, LiveRider, ServerMessage } from './protocol';
import { RunReporter } from './run-reporter';

/** Physics ticks between two messages of the run of the player: 10 per second. */
export const LIVE_SEND_INTERVAL = 5;

/** Delays before connecting again after losing the connection, in milliseconds. */
export const LIVE_RECONNECT_DELAYS = [1000, 3000, 10000, 30000];

/** Close codes after which connecting again would be refused all the same. */
const FINAL_CLOSE_CODES: number[] = [
    LIVE_CLOSE_CODES.INVALID_TOKEN,
    LIVE_CLOSE_CODES.SESSION_FULL,
    LIVE_CLOSE_CODES.SERVER_FULL,
    LIVE_CLOSE_CODES.BAD_MESSAGE,
    LIVE_CLOSE_CODES.REPLACED,
];

/** State of a live session, told to the page with the `openrider:live` event. */
export interface LiveState {
    state: 'connecting' | 'open' | 'closed';
    /** What to tell the player about the connection, empty while it is open. */
    message: string;
    /** The player, once in the session. */
    you: LiveRider | null;
    /** Best times of the riders of the session, fastest first. */
    results: LiveResult[];
    /**
     * How the verification of the last run finishing the track went, null before any: its time,
     * and its distance in whole meters on an endurance track.
     */
    finish: { time: number; distance?: number } | { reason: string } | null;
}

/** Sessions of the tracks, one per track. */
const SESSIONS = new WeakMap<Track, LiveSession>();

/**
 * Live session of a track: the player races the track at the same time as the other riders of
 * the session, each seeing the others ride (see `src/openrider/live/protocol.ts`).
 *
 * The run of the player goes to the session server as it is ridden ({@link RunReporter}), and
 * the runs of the others come back to be replayed by remote runners (`Track.remoteRunners`).
 * The runs of the player finishing the track are verified by the server for the results of the
 * session. A lost connection is opened again after a while, the runs being sent again whole.
 */
export class LiveSession {
    public state: LiveState = {
        state: 'connecting',
        message: 'Connecting to the session...',
        you: null,
        results: [],
        finish: null,
    };

    private socket: WebSocket | null = null;
    private readonly reporter: RunReporter;
    /** Physics ticks since the session started, to send the run every few ones. */
    private ticks = 0;
    /** Connections lost in a row, for the delay before the next one. */
    private retries = 0;
    private stopped = false;
    /** Riders whose whole run was asked again, until it comes. */
    private readonly resyncing = new Set<string>();

    private constructor(
        private readonly track: Track,
        private readonly url: string,
        private readonly token: string,
    ) {
        this.reporter = new RunReporter(track.playerRunner);
        this.connect();
    }

    /** The session of a track, if any. */
    public static of(track: Track): LiveSession | undefined {
        return SESSIONS.get(track);
    }

    /** Joins a session on the track, once per track. */
    public static start(track: Track, url: string, token: string): LiveSession {
        let session = SESSIONS.get(track);
        if (!session) {
            session = new LiveSession(track, url, token);
            SESSIONS.set(track, session);
        }
        return session;
    }

    /**
     * Sends the run of the player every few physics ticks, and asks again for the runs whose
     * replay no longer matches them. Called on each physics tick of the track.
     */
    public tick(): void {
        if (++this.ticks % LIVE_SEND_INTERVAL !== 0) {
            return;
        }
        // Dropped while not connected: the whole run is sent once connected again
        const events = this.reporter.flush();
        if (!this.isOpen()) {
            return;
        }
        this.send({ type: 'run', events });

        this.track.remoteRunners.forEach((runner, rider) => {
            if (runner.desynced && !this.resyncing.has(rider)) {
                this.resyncing.add(rider);
                this.send({ type: 'resync', rider });
            }
        });
    }

    /**
     * Sends the run of the player that just finished the track, or fell on an endurance track,
     * for the server to verify it.
     *
     * @param ghostString - Ghost string of the run.
     * @param time - Time of the run, in physics ticks.
     */
    public finish(ghostString: string, time: number): void {
        if (this.isOpen()) {
            this.send({ type: 'finish', ghostString, time });
        }
    }

    /** Leaves the session for good. */
    public stop(): void {
        this.stopped = true;
        this.reporter.detach();
        this.socket?.close(1000);
        this.socket = null;
        this.track.remoteRunners.clear();
        SESSIONS.delete(this.track);
    }

    private connect(): void {
        const url = new URL(this.url);
        url.searchParams.set('token', this.token);
        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onopen = () => {
            // The events kept while not connected are part of the whole run
            this.reporter.flush();
            this.send({ type: 'run', events: this.reporter.resync() });
        };
        socket.onmessage = (event: MessageEvent) => {
            if (socket === this.socket && typeof event.data === 'string') {
                this.receive(JSON.parse(event.data) as ServerMessage);
            }
        };
        socket.onclose = (event: CloseEvent) => this.closed(socket, event.code, event.reason);
    }

    private receive(message: ServerMessage): void {
        const runners = this.track.remoteRunners;
        switch (message.type) {
            case 'welcome':
                this.retries = 0;
                runners.clear();
                this.resyncing.clear();
                for (const rider of message.riders) {
                    this.addRunner(rider).receive(rider.events);
                }
                this.update({
                    state: 'open',
                    message: '',
                    you: message.you,
                    results: message.results,
                });
                return;
            case 'joined':
                // A rider joining again starts over
                this.addRunner(message.rider);
                return;
            case 'left':
                runners.delete(message.rider);
                this.resyncing.delete(message.rider);
                return;
            case 'run': {
                const runner = runners.get(message.rider);
                if (message.resync && runner) {
                    this.resyncing.delete(message.rider);
                    this.addRunner({ id: message.rider, name: runner.ghostName }).receive(
                        message.events,
                    );
                } else {
                    runner?.receive(message.events);
                }
                return;
            }
            case 'results':
                this.update({ results: message.results });
                return;
            case 'finished':
                this.update({
                    finish: {
                        time: message.time,
                        ...(message.distance === undefined ? {} : { distance: message.distance }),
                    },
                });
                return;
            case 'refused':
                this.update({ finish: { reason: message.reason } });
                return;
        }
    }

    /** Adds the runner of a rider, replacing the one they had. */
    private addRunner(rider: LiveRider): RemoteRunner {
        const runner = new RemoteRunner(this.track, rider.name);
        this.track.remoteRunners.set(rider.id, runner);
        return runner;
    }

    private closed(socket: WebSocket, code: number, reason: string): void {
        if (socket !== this.socket) {
            return;
        }
        this.socket = null;
        this.track.remoteRunners.clear();
        this.resyncing.clear();
        if (this.stopped) {
            return;
        }

        const delay = LIVE_RECONNECT_DELAYS[this.retries];
        if (FINAL_CLOSE_CODES.includes(code) || delay === undefined) {
            this.update({
                state: 'closed',
                message: FINAL_CLOSE_CODES.includes(code)
                    ? reason || 'The session server refused the connection'
                    : 'Connection to the session lost: reload the page to join again',
            });
            return;
        }
        this.retries++;
        this.update({ state: 'connecting', message: 'Connection lost, connecting again...' });
        setTimeout(() => {
            if (!this.stopped) {
                this.connect();
            }
        }, delay);
    }

    private isOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    private send(message: ClientMessage): void {
        this.socket?.send(JSON.stringify(message));
    }

    /** Changes the state, telling the page. */
    private update(changes: Partial<LiveState>): void {
        this.state = { ...this.state, ...changes };
        if (typeof CustomEvent === 'function') {
            globalThis.document?.dispatchEvent?.(
                new CustomEvent('openrider:live', { detail: this.state }),
            );
        }
    }
}
