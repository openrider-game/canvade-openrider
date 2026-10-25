/**
 * Pseudo-random numbers from a seed (mulberry32): the same seed always gives the same numbers,
 * so that an endurance track can be generated again identically, e.g. to retry it.
 */
export class SeededRandom {
    private state: number;

    /** @param seed - Any integer, only its 32 lowest bits are used. */
    public constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /** Next number, between 0 included and 1 excluded. */
    public next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Number between `min` included and `max` excluded. */
    public range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    /** Integer between `min` and `max`, both included. */
    public int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }

    /** Whether an event of probability `probability` happens. */
    public chance(probability: number): boolean {
        return this.next() < probability;
    }

    /**
     * Picks a key by weight, a key of weight 2 being picked twice as often as a key of weight 1.
     * The keys of weight 0 or less are never picked.
     */
    public pick<T extends string>(weights: Record<T, number>): T {
        const entries = (Object.entries(weights) as Array<[T, number]>).filter(([, w]) => w > 0);
        let roll = this.next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
        for (const [key, weight] of entries) {
            roll -= weight;
            if (roll < 0) {
                return key;
            }
        }
        return entries[entries.length - 1][0];
    }

    /** Seed of a part of a generation, e.g. a section of a track, from the seed of the whole. */
    public static derive(seed: number, index: number): number {
        let hash = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul(index, 0xc2b2ae35);
        hash = Math.imul(hash ^ (hash >>> 16), 0x27d4eb2d);
        return (hash ^ (hash >>> 15)) >>> 0;
    }

    /** New seed, different on every call, for a new track. */
    public static randomSeed(): number {
        return Math.floor(Math.random() * 4294967296) >>> 0;
    }
}
