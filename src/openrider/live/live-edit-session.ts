import { Vector } from 'canvade';
import type { TrackEdit, TrackSnapshot } from '../edit/track-edit';
import type { Track } from '../track/track';
import { LiveConnection, LiveConnectionState } from './live-connection';
import { EDIT_LIMITS, LiveRider, ServerMessage } from './protocol';

/** Time between two messages of the edits and the cursor, in milliseconds: 10 per second. */
export const EDIT_SEND_INTERVAL = 100;

/** Colors of the cursors of the other editors, picked from their id. */
const CURSOR_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65'];

/** State of an editing session, told to the page with the `openrider:live` event. */
export interface LiveEditState extends LiveConnectionState {
    /** The player, once in the session. */
    you: LiveRider | null;
    /** Editors of the track, the player among them. */
    editors: LiveRider[];
    /** Whether the track edited is the one of the session, false while waiting for it. */
    loaded: boolean;
    /** Editor who gave the track to the session, its main creator, null until known. */
    host: string | null;
}

/** Sessions of the tracks, one per track. */
const SESSIONS = new WeakMap<Track, LiveEditSession>();

/**
 * Editing session of a track: the player edits the track at the same time as the other editors
 * of the session, each seeing the edits and the cursors of the others (see
 * `src/openrider/live/protocol.ts`).
 *
 * The edits made here (`TrackEditor.onEdit`) are applied at once, then sent; the server numbers
 * the edits of everyone and sends them back to every screen, which applies them in that order,
 * its own ones again: the edits being idempotent, every screen ends with the same track, the
 * objects ranked in that order in the grid cells. The first screen gives its track to the
 * session; the others load it, then apply the edits since. Undoing only undoes the edits made
 * here, as an edit too.
 */
export class LiveEditSession extends LiveConnection<LiveEditState> {
    /**
     * The accounts that edited the track, signed by the server, for the site to credit them when
     * the track is uploaded; null until someone edited it.
     */
    public credits: string | null = null;

    /** Edits made here, sent with the next message. */
    private outgoing: TrackEdit[] = [];
    /** Number of the last edit of the session applied here. */
    private seq = 0;
    /** Edits received while waiting for the track of the session, numbered. */
    private pending: Array<{ seq: number; edit: TrackEdit }> = [];
    /** Cursors of the other editors, in world units, by editor id. */
    private readonly cursors = new Map<string, Vector>();
    /** Last cursor sent, as JSON. */
    private sentCursor = 'null';
    /** Time since the last message of the edits and the cursor, in milliseconds. */
    private elapsed = 0;

    private constructor(
        private readonly track: Track,
        url: string,
        token: string,
    ) {
        super(url, token, {
            state: 'connecting',
            message: 'Connecting to the session...',
            you: null,
            editors: [],
            loaded: false,
            host: null,
        });
        track.editor.onEdit = (edit) => this.outgoing.push(edit);
        this.connect();
    }

    /** The session of a track, if any. */
    public static of(track: Track): LiveEditSession | undefined {
        return SESSIONS.get(track);
    }

    /**
     * Whether the player is the host of the session, its main creator: the only one exporting
     * and uploading the track, see `TrackEditingState`.
     */
    public get isHost(): boolean {
        return this.state.you !== null && this.state.you.id === this.state.host;
    }

    /** Joins a session editing the track, once per track. */
    public static start(track: Track, url: string, token: string): LiveEditSession {
        let session = SESSIONS.get(track);
        if (!session) {
            session = new LiveEditSession(track, url, token);
            SESSIONS.set(track, session);
        }
        return session;
    }

    /**
     * Sends the edits made here and the cursor every {@link EDIT_SEND_INTERVAL}, once the track of
     * the session is loaded. Called on every frame.
     *
     * @param delta - Time since the last frame, in milliseconds.
     */
    public update(delta: number): void {
        this.elapsed += delta;
        if (this.elapsed < EDIT_SEND_INTERVAL || !this.isOpen() || !this.state.loaded) {
            return;
        }
        this.elapsed = 0;

        // Kept while not connected or not loaded: applied by every screen once sent
        while (this.outgoing.length) {
            this.send({ type: 'edits', edits: this.outgoing.splice(0, EDIT_LIMITS.edits) });
        }

        const track = this.track;
        const pos: [number, number] | null = track.mouseIn
            ? [Math.round(track.mousePos.x), Math.round(track.mousePos.y)]
            : null;
        const cursor = JSON.stringify(pos);
        if (cursor !== this.sentCursor) {
            this.sentCursor = cursor;
            this.send({ type: 'cursor', pos });
        }
    }

    /** Draws the cursors of the other editors, with their names. */
    public renderCursors(ctx: CanvasRenderingContext2D): void {
        const names = new Map(this.state.editors.map((editor) => [editor.id, editor.name]));
        const scale = this.track.pixelRatio;
        ctx.save();
        ctx.font = `bold ${12 * scale}px Arial, Helvetica, sans-serif`;
        ctx.lineWidth = 1.5 * scale;
        this.cursors.forEach((pos, id) => {
            const { x, y } = this.track.toPixel(pos);
            ctx.fillStyle = LiveEditSession.colorOf(id);
            // An arrow pointing at the position, then the name of the editor under it
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 16 * scale);
            ctx.lineTo(x + 4 * scale, y + 12 * scale);
            ctx.lineTo(x + 11 * scale, y + 12 * scale);
            ctx.closePath();
            ctx.fill();
            ctx.fillText(names.get(id) ?? '', x + 8 * scale, y + 26 * scale);
        });
        ctx.restore();
    }

    public override stop(): void {
        super.stop();
        if (this.track.editor.onEdit) {
            this.track.editor.onEdit = null;
        }
        SESSIONS.delete(this.track);
    }

    /** Changes the state, the interface showing the buttons of the host following it. */
    protected override setState(changes: Partial<LiveEditState>): void {
        super.setState(changes);
        this.track.invalidateUI();
    }

    protected opened(): void {}

    protected received(message: ServerMessage): void {
        switch (message.type) {
            case 'welcome': {
                const editor = message.editor;
                if (!editor) {
                    this.setState({ state: 'closed', message: 'Not an editing session' });
                    return;
                }
                this.track.editor.prefix = editor.prefix;
                this.setState({
                    state: 'open',
                    message: '',
                    you: message.you,
                    editors: message.results.filter((result) => result.riding),
                    host: editor.host,
                });
                if (editor.provide) {
                    // The track edited here becomes the one of the session
                    this.seq = 0;
                    this.send({ type: 'snapshot', seq: 0, snapshot: this.track.editor.snapshot() });
                    this.setState({ loaded: true });
                } else if (editor.snapshot) {
                    this.loadSnapshot(editor.snapshot, editor.seq);
                    editor.edits.forEach((edit, i) => this.applyEdit(edit, editor.seq + 1 + i));
                } else {
                    this.setState({
                        loaded: false,
                        message: 'Waiting for the track of the session...',
                    });
                }
                return;
            }
            case 'snapshot':
                this.setState({ host: message.host });
                if (!this.state.loaded) {
                    this.loadSnapshot(message.snapshot, message.seq);
                }
                return;
            case 'edits':
                message.edits.forEach((edit, i) => {
                    const seq = message.first + i;
                    if (this.state.loaded) {
                        this.applyEdit(edit, seq);
                    } else {
                        this.pending.push({ seq, edit });
                    }
                });
                return;
            case 'snapshotRequest':
                if (!this.state.loaded) {
                    // The first editor left without giving the track: this screen gives its own,
                    // becoming the host, then applies the edits made meanwhile
                    this.setState({ loaded: true, message: '', host: this.state.you?.id ?? null });
                    this.send({ type: 'snapshot', seq: 0, snapshot: this.track.editor.snapshot() });
                    const pending = this.pending;
                    this.pending = [];
                    pending.forEach(({ seq, edit }) => this.applyEdit(edit, seq));
                    return;
                }
                this.send({
                    type: 'snapshot',
                    seq: this.seq,
                    snapshot: this.track.editor.snapshot(),
                });
                return;
            case 'cursor':
                if (message.pos) {
                    this.cursors.set(message.rider, new Vector(...message.pos));
                } else {
                    this.cursors.delete(message.rider);
                }
                return;
            case 'left':
                this.cursors.delete(message.rider);
                return;
            case 'results':
                this.setState({ editors: message.results.filter((result) => result.riding) });
                return;
            case 'credits':
                this.credits = message.token;
                return;
        }
    }

    protected lost(): void {
        this.cursors.clear();
        this.pending = [];
        this.sentCursor = 'null';
        this.setState({ loaded: false });
    }

    /** Loads the track of the session, then the edits received meanwhile. */
    private loadSnapshot(snapshot: TrackSnapshot, seq: number): void {
        this.track.editor.load(snapshot);
        this.seq = seq;
        this.setState({ loaded: true, message: '' });
        const pending = this.pending;
        this.pending = [];
        pending.forEach(({ seq: number, edit }) => this.applyEdit(edit, number));
    }

    /** Applies an edit of the session, unless the track already has it. */
    private applyEdit(edit: TrackEdit, seq: number): void {
        if (seq <= this.seq) {
            return;
        }
        this.track.editor.apply(edit);
        this.track.editor.order(edit, seq);
        this.seq = seq;
    }

    /** Color of the cursor of an editor, the same on every screen. */
    private static colorOf(id: string): string {
        let hash = 0;
        for (const char of id) {
            hash = (hash * 31 + char.charCodeAt(0)) | 0;
        }
        return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
    }
}
