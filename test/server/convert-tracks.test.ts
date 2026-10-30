import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { EDITOR_FORMAT } from '../../src/openrider/parser/legacy-format';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import { GhostVerifier } from '../../src/verify/ghost-verifier';

/** Track 1 of the sample of the backend, and the ghost of `Rookie` finishing it. */
const TRACK_CODE =
    '-50 1i io 1i p0 a s4 a 12c 1i 3a8 1i#68 -4m 84 -5a aa -50 bs -5f do -4m,1l4 -68 1n0 -71' +
    ' 1pg -6i 1rc -76 1t8 -68,340 1i 340 -1s#C 1i0 18,T 340 18###BMX#0 0';
const GHOST = '0,,99 119,74 97 122 138 148 159,,227,BMX,Rookie';

/** Limits of the verifications, never reached here. */
const LIMITS = { maxTicks: 1000, deadline: Infinity };

const EDITOR_CODE = JSON.stringify({
    format: EDITOR_FORMAT,
    version: 1,
    bike: 'MTB',
    layers: [
        { name: 'Ground', type: 'main', solid: '-50 1i 50 1i,', items: 'T 0 0,' },
        { name: 'Decor', type: 'foreground', visible: false, scenery: '0 0 a a,' },
    ],
});

/** Results of the converter of the migration, built by `npm run build`, for tracks by id. */
function convert(codes: Record<number, string | Uint8Array>): Array<Record<string, unknown>> {
    const input = Object.entries(codes).map(([id, code]) => ({
        id: Number(id),
        code: Buffer.from(code).toString('base64'),
    }));
    const result = spawnSync(process.execPath, [join(__dirname, '../../dist/convert-tracks.cjs')], {
        input: JSON.stringify(input),
        encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    return JSON.parse(result.stdout) as Array<Record<string, unknown>>;
}

describe('Converter of the migration', () => {
    test('converts track codes to track codes and editor files to editor files', () => {
        const [track, editor] = convert({ 1: TRACK_CODE, 2: EDITOR_CODE });
        const trackFile = new Uint8Array(Buffer.from(track.code as string, 'base64'));
        const editorFile = new Uint8Array(Buffer.from(editor.code as string, 'base64'));

        expect(TrackFormat.isEditorCode(trackFile)).toBe(false);
        expect(TrackFormat.read(trackFile)).toEqual(TrackFormat.read(TRACK_CODE));
        expect(TrackFormat.isEditorCode(editorFile)).toBe(true);
        expect(TrackFormat.read(editorFile)).toEqual(TrackFormat.read(EDITOR_CODE));
        expect(trackFile.length).toBeLessThan(TRACK_CODE.length);
    });

    test('keeps the ghosts of a converted track valid', () => {
        const [track] = convert({ 1: TRACK_CODE });

        // The text of the track file, as the site gives it to the verifier
        expect(GhostVerifier.verify(track.code as string, GHOST, 227, LIMITS).valid).toBe(true);
        expect(GhostVerifier.verify(TRACK_CODE, GHOST, 227, LIMITS).valid).toBe(true);
    });

    test('skips the track files, and tells why a track cannot be converted', () => {
        const file = TrackFormat.encode(TrackFormat.read(TRACK_CODE), false);

        expect(convert({ 3: file, 4: '{"format":"other"}' })).toEqual([
            { id: 3, binary: true },
            { id: 4, error: 'Not an OpenRider editor file' },
        ]);
    });
});
