/**
 * Converts tracks saved in the original text formats of the game to its track files, for the
 * migration of the backend database (`backend/migrate-tracks.php`).
 *
 * Reads a JSON array from its standard input, `[{ id, code }]`, each code being the base 64 of
 * the bytes stored, and writes a JSON array of the results in the same order: `{ id, code }`
 * with the base 64 of the track file, `{ id, binary: true }` for a code already a track file, or
 * `{ id, error }` for a code that cannot be converted, left as it is.
 *
 * A track code becomes a track code and an editor file an editor file. Each track file is read
 * back and compared to the track read from the original code before it is given: a track whose
 * conversion would lose anything is refused.
 */
import { TrackFormat } from '../../src/openrider/parser/track-format';

interface Input {
    id: number;
    code: string;
}

type Result = { id: number } & ({ code: string } | { binary: true } | { error: string });

/** Converts the code of a track, see the file comment. */
function convert({ id, code }: Input): Result {
    const bytes = new Uint8Array(Buffer.from(code, 'base64'));
    if (TrackFormat.isBinary(bytes)) {
        return { id, binary: true };
    }

    try {
        const document = TrackFormat.read(bytes);
        const file = TrackFormat.encode(document, TrackFormat.isEditorCode(bytes));
        // The track file holds the same track: every layer, entity, value, the bike and origin
        if (JSON.stringify(TrackFormat.read(file)) !== JSON.stringify(document)) {
            return { id, error: 'The track file read back differs from the original track' };
        }
        return { id, code: Buffer.from(file).toString('base64') };
    } catch (e) {
        return { id, error: e instanceof Error ? e.message : String(e) };
    }
}

async function main(): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    let inputs: unknown;
    try {
        inputs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        inputs = null;
    }
    if (
        !Array.isArray(inputs) ||
        !inputs.every(
            (input: Input) => Number.isInteger(input?.id) && typeof input.code === 'string',
        )
    ) {
        process.stderr.write('Expected [{ id, code }] as JSON, each code in base 64\n');
        process.exitCode = 1;
        return;
    }

    process.stdout.write(JSON.stringify((inputs as Input[]).map(convert)));
}

void main();
