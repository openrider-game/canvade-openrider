import { spawn } from 'node:child_process';

/** Run of the player finishing a track, as given to the ghost verifier. */
export interface VerifyInput {
    trackCode: string;
    ghostString: string;
    /** Time of the run, in physics ticks. */
    time: number;
}

/** Verdict of the ghost verifier. */
export interface Verdict {
    valid: boolean;
    /** Why the run is refused, empty when it is valid. */
    reason: string;
}

/**
 * Runs the ghost verifier of the game (`dist/verify-ghost.cjs`, see `src/verify`) in its own
 * Node process, as the site does: a long run takes a while to replay, and the server keeps
 * answering the riders meanwhile.
 *
 * At most `concurrency` verifiers run at once, the others waiting for their turn.
 *
 * @param verifierPath - Path of the built verifier.
 * @param timeout - Time after which the verifier gives up, in seconds.
 */
export function createVerifier(
    verifierPath: string,
    timeout: number,
    concurrency = 2,
): (input: VerifyInput) => Promise<Verdict> {
    let running = 0;
    const waiting: Array<() => void> = [];

    const run = (input: VerifyInput) =>
        new Promise<Verdict>((resolve, reject) => {
            const child = spawn(process.execPath, [verifierPath], {
                env: { ...process.env, OPENRIDER_VERIFY_TIMEOUT: String(timeout) },
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let output = '';
            let errors = '';
            child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
            child.stderr.setEncoding('utf8').on('data', (chunk: string) => (errors += chunk));
            child.on('error', reject);
            child.on('close', (status) => {
                try {
                    const verdict = JSON.parse(output) as Partial<Verdict>;
                    if (status === 0 && typeof verdict.valid === 'boolean') {
                        resolve({ valid: verdict.valid, reason: String(verdict.reason ?? '') });
                        return;
                    }
                } catch {
                    // Reported below
                }
                reject(new Error(`Ghost verifier failed (${status}): ${errors.trim()}`));
            });
            child.stdin.end(JSON.stringify(input));
        });

    return async (input) => {
        if (running < concurrency) {
            running++;
        } else {
            // The slot of a verifier over is handed over, see below
            await new Promise<void>((resume) => waiting.push(resume));
        }
        try {
            return await run(input);
        } finally {
            const next = waiting.shift();
            if (next) {
                next();
            } else {
                running--;
            }
        }
    };
}
