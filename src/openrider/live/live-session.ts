import { RemoteRunner } from '../bike/runner/remote-runner';
import type { Track } from '../track/track';
import { LiveConnection, LiveConnectionState } from './live-connection';
import type { LiveResult, LiveRider, ServerMessage } from './protocol';
import { RunReporter } from './run-reporter';

export { LIVE_RECONNECT_DELAYS } from './live-connection';

/** Physics ticks between two messages of the run of the player: 10 per second. */
export const LIVE_SEND_INTERVAL = 5;

/** State of a live session, told to the page with the `openrider:live` event. */
export interface LiveState extends LiveConnectionState {
    /** The player, once in the session. */
    you: LiveRider | null;
    /** Best times of the riders of the session, fastest first. */
    results: LiveResult[];
    /**
     * How the verification of the last run finishing the track went, null before any: its time,
     * and its distance in whole meters on an endurance track, retired there or not.
     */
    finish: { time: number; distance?: number; retired?: true } | { reason: string } | null;
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
export class LiveSession extends LiveConnection<LiveState> {
    private readonly reporter: RunReporter;
    /** Physics ticks since the session started, to send the run every few ones. */
    private ticks = 0;
    /** Riders whose whole run was asked again, until it comes. */
    private readonly resyncing = new Set<string>();

    private constructor(
        private readonly track: Track,
        url: string,
        token: string,
    ) {
        super(url, token, {
            state: 'connecting',
            message: 'Connecting to the session...',
            you: null,
            results: [],
            finish: null,
        });
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
    /** The player retired their run after the given tick, see `EnduranceRider.retire`. */
    public retired(time: number): void {
        this.reporter.retired(time);
    }

    public finish(ghostString: string, time: number): void {
        if (this.isOpen()) {
            this.send({ type: 'finish', ghostString, time });
        }
    }

    public override stop(): void {
        super.stop();
        this.reporter.detach();
        SESSIONS.delete(this.track);
    }

    protected opened(): void {
        // The events kept while not connected are part of the whole run
        this.reporter.flush();
        this.send({ type: 'run', events: this.reporter.resync() });
    }

    protected received(message: ServerMessage): void {
        const runners = this.track.remoteRunners;
        switch (message.type) {
            case 'welcome':
                runners.clear();
                this.resyncing.clear();
                for (const rider of message.riders) {
                    this.addRunner(rider).receive(rider.events);
                }
                this.setState({
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
                this.setState({ results: message.results });
                return;
            case 'finished':
                this.setState({
                    finish: {
                        time: message.time,
                        ...(message.distance === undefined ? {} : { distance: message.distance }),
                        ...(message.retired ? { retired: true } : {}),
                    },
                });
                return;
            case 'refused':
                this.setState({ finish: { reason: message.reason } });
                return;
        }
    }

    protected lost(): void {
        this.track.remoteRunners.clear();
        this.resyncing.clear();
    }

    /** Adds the runner of a rider, replacing the one they had. */
    private addRunner(rider: LiveRider): RemoteRunner {
        const runner = new RemoteRunner(this.track, rider.name);
        this.track.remoteRunners.set(rider.id, runner);
        return runner;
    }
}
