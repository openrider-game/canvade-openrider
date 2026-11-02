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
    /** Inputs kept for the run of a rider (see `RunLog`). */
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
