/** Result of a run in endurance mode. */
export interface EnduranceResult {
    /** Distance from the start, in meters. */
    distance: number;
    /** Time of the run when the rider fell, in physics ticks. */
    time: number;
    /** Seed of the track. */
    seed: number;
}

/** Records beaten by a result, see {@link EnduranceRecords.submit}. */
export interface BeatenRecords {
    /** Best result of every track. */
    overall: boolean;
    /** Best result of the track of the result. */
    track: boolean;
}

/** Key of the records in the storage of the browser. */
const STORAGE_KEY = 'openrider.endurance.records';

interface StoredRecords {
    best: EnduranceResult | null;
    /** Best result of each track, by seed. */
    tracks: Record<string, EnduranceResult>;
}

/**
 * Best results of the player in endurance mode, kept in the storage of the browser.
 *
 * A result beats another one by going further, in whole meters, or as far but faster. The
 * storage may be unavailable (private windows, blocked storage): the records then only last
 * until the page is closed.
 */
export class EnduranceRecords {
    private records: StoredRecords;

    public constructor(private readonly storage: Storage | null = EnduranceRecords.localStorage()) {
        this.records = this.load();
    }

    /** Best result of every track, null before the first run. */
    public get best(): EnduranceResult | null {
        return this.records.best;
    }

    /** Best result of a track, null before its first run. */
    public bestOn(seed: number): EnduranceResult | null {
        return this.records.tracks[seed] ?? null;
    }

    /** Whether a result beats another one: further, in whole meters, or as far and faster. */
    public static beats(result: EnduranceResult, other: EnduranceResult | null): boolean {
        if (other === null) {
            return true;
        }
        const [distance, otherDistance] = [Math.floor(result.distance), Math.floor(other.distance)];
        return distance > otherDistance || (distance === otherDistance && result.time < other.time);
    }

    /** Keeps a result when it beats the records, telling which ones. */
    public submit(result: EnduranceResult): BeatenRecords {
        const beaten = {
            overall: EnduranceRecords.beats(result, this.best),
            track: EnduranceRecords.beats(result, this.bestOn(result.seed)),
        };
        if (beaten.overall) {
            this.records.best = result;
        }
        if (beaten.track) {
            this.records.tracks[result.seed] = result;
        }
        if (beaten.overall || beaten.track) {
            this.save();
        }
        return beaten;
    }

    private load(): StoredRecords {
        try {
            const stored = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null') as unknown;
            if (stored && typeof stored === 'object' && 'tracks' in stored) {
                return stored as StoredRecords;
            }
        } catch {
            // Unreadable or blocked: starts over
        }
        return { best: null, tracks: {} };
    }

    private save(): void {
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.records));
        } catch {
            // Full or blocked: the records last until the page is closed
        }
    }

    /** Storage of the browser, null where it cannot be reached. */
    private static localStorage(): Storage | null {
        try {
            return typeof localStorage === 'undefined' ? null : localStorage;
        } catch {
            return null;
        }
    }
}
