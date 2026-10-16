/** Time formatting helpers. */
export abstract class Time {
    /** Formats a duration in milliseconds as `mm:ss.d` (tenths of a second). */
    public static format(millisFull: number): string {
        const minutes = Math.floor(millisFull / 60000);
        const seconds = Math.floor((millisFull % 60000) / 1000);
        const millis = Math.floor((millisFull - minutes * 60000 - seconds * 1000) / 100);

        const pad = (value: number) => value.toString().padStart(2, '0');

        return `${pad(minutes)}:${pad(seconds)}.${millis}`;
    }
}
