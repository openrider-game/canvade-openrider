import { ClientMessage, LIVE_CLOSE_CODES, ServerMessage } from './protocol';

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

/** State of the connection to a live session, see {@link LiveConnection}. */
export interface LiveConnectionState {
    state: 'connecting' | 'open' | 'closed';
    /** What to tell the player about the connection, empty while it is open. */
    message: string;
}

/**
 * Connection to the session server of a live session, racing or editing a track (see
 * `src/openrider/live/protocol.ts`): connects with the token of the player, and connects again
 * after a while when the connection is lost, unless the server refused it for good. The state of
 * the session is told to the page with the `openrider:live` event on the document.
 */
export abstract class LiveConnection<S extends LiveConnectionState> {
    protected socket: WebSocket | null = null;
    /** Connections lost in a row, for the delay before the next one. */
    private retries = 0;
    private stopped = false;

    protected constructor(
        private readonly url: string,
        private readonly token: string,
        public state: S,
    ) {}

    /** Leaves the session for good. */
    public stop(): void {
        this.stopped = true;
        this.socket?.close(1000);
        this.socket = null;
        this.lost();
    }

    /** Called once connected, before the welcome of the server. */
    protected abstract opened(): void;
    /** Called with each message of the server. */
    protected abstract received(message: ServerMessage): void;
    /** Called once the connection is lost or closed, to forget what came with it. */
    protected abstract lost(): void;

    protected connect(): void {
        const url = new URL(this.url);
        url.searchParams.set('token', this.token);
        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onopen = () => this.opened();
        socket.onmessage = (event: MessageEvent) => {
            if (socket === this.socket && typeof event.data === 'string') {
                const message = JSON.parse(event.data) as ServerMessage;
                if (message.type === 'welcome') {
                    this.retries = 0;
                }
                this.received(message);
            }
        };
        socket.onclose = (event: CloseEvent) => this.closed(socket, event.code, event.reason);
    }

    protected isOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    protected send(message: ClientMessage): void {
        this.socket?.send(JSON.stringify(message));
    }

    /** Changes the state, telling the page. */
    protected setState(changes: Partial<S>): void {
        this.state = { ...this.state, ...changes };
        if (typeof CustomEvent === 'function') {
            globalThis.document?.dispatchEvent?.(
                new CustomEvent('openrider:live', { detail: this.state }),
            );
        }
    }

    private closed(socket: WebSocket, code: number, reason: string): void {
        if (socket !== this.socket) {
            return;
        }
        this.socket = null;
        this.lost();
        if (this.stopped) {
            return;
        }

        const delay = LIVE_RECONNECT_DELAYS[this.retries];
        if (FINAL_CLOSE_CODES.includes(code) || delay === undefined) {
            this.setState({
                state: 'closed',
                message: FINAL_CLOSE_CODES.includes(code)
                    ? reason || 'The session server refused the connection'
                    : 'Connection to the session lost: reload the page to join again',
            } as Partial<S>);
            return;
        }
        this.retries++;
        this.setState({
            state: 'connecting',
            message: 'Connection lost, connecting again...',
        } as Partial<S>);
        setTimeout(() => {
            if (!this.stopped) {
                this.connect();
            }
        }, delay);
    }
}
