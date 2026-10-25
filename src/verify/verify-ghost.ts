/**
 * Command line verifying a ghost, run by the backend before saving it: `node verify-ghost.cjs`.
 *
 * Reads a JSON object from its standard input, `{ trackCode, ghostString, time }` (time in
 * physics ticks), and writes the verdict as JSON, `{ valid, reason }`. A run of the endurance
 * mode gives the seed of its track instead of a track code, `{ seed, ghostString, time }`, and
 * gets its distance in meters with the verdict, `{ valid, reason, distance }`. Exits with 0 once
 * the verdict is written, valid or not, and with 1 when the input cannot be read.
 *
 * Gives up after `OPENRIDER_VERIFY_TIMEOUT` seconds (60 by default), and refuses the runs longer
 * than two hours.
 */
import './node-stubs';
import { GAME_UPS } from '../openrider/constants/game.constants';
import { EnduranceVerdict, GhostVerdict, GhostVerifier } from './ghost-verifier';

/** The Node globals used here, the project having no Node types. */
declare const process: {
    stdin: AsyncIterable<string> & { setEncoding(encoding: string): void };
    stdout: { write(text: string): void };
    stderr: { write(text: string): void };
    env: Record<string, string | undefined>;
    exitCode?: number;
};

/** Longest run verified, in physics ticks: two hours. */
const MAX_TICKS = 2 * 60 * 60 * GAME_UPS;

/** A ghost on a published track, or a run of the endurance mode on the track of its seed. */
type VerifyInput = { ghostString: string; time: number } & (
    { trackCode: string; seed?: undefined } | { seed: number; trackCode?: undefined }
);

function isVerifyInput(value: unknown): value is VerifyInput {
    const input = value as Record<string, unknown> | null;
    const seed = Number(input?.seed);
    const hasTrack =
        typeof input?.trackCode === 'string' ||
        (Number.isInteger(input?.seed) && seed >= 0 && seed < 2 ** 32);
    return hasTrack && typeof input?.ghostString === 'string' && Number.isInteger(input.time);
}

async function readInput(): Promise<string> {
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) {
        input += chunk;
    }
    return input;
}

async function main(): Promise<void> {
    let input: unknown;
    try {
        input = JSON.parse(await readInput());
    } catch {
        input = null;
    }
    if (!isVerifyInput(input)) {
        process.stderr.write('Expected { trackCode or seed, ghostString, time } as JSON\n');
        process.exitCode = 1;
        return;
    }

    const timeout = Number(process.env.OPENRIDER_VERIFY_TIMEOUT) || 60;
    const limits = { maxTicks: MAX_TICKS, deadline: Date.now() + timeout * 1000 };
    let verdict: GhostVerdict | EnduranceVerdict;
    try {
        verdict =
            input.trackCode !== undefined
                ? GhostVerifier.verify(input.trackCode, input.ghostString, input.time, limits)
                : GhostVerifier.verifyEndurance(input.seed, input.ghostString, input.time, limits);
    } catch (e) {
        verdict = { valid: false, reason: e instanceof Error ? e.message : String(e) };
    }

    process.stdout.write(JSON.stringify(verdict));
}

void main();
