import { describe, expect, test, vi } from 'vitest';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import { formatItem } from '../../src/openrider/parser/track-document';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import { TrackParser } from '../../src/openrider/parser/track-parser';
import { Track } from '../../src/openrider/track/track';
import { TRACK_DEFAULT } from '../../src/openrider/track/track.constants';
import { parseTrack } from '../helpers/track';

const FULL_TRACK =
    // Solid lines: a polyline of 3 points (2 lines) and a single line
    '0 0 a 0 k 0,0 a a a#' +
    // Scenery lines
    '0 -a a -a#' +
    // Items: target, checkpoint, boost, teleporters, status effects, unknown item
    'T 5 5,C 6 6,B 7 7 -2s,W 8 8 9 9,R 1 1,I 2 2,H 3 3,N 4 4,E 5 6,Q 1 1#' +
    // Foreground solid and scenery lines
    '0 1 a 1#0 2 a 2#' +
    'MTB#a -5';

function generate(track: Track): string {
    const generator = new TrackGenerator(track);
    for (let step = 0; !generator.done; step++) {
        if (step > 1000) throw new Error('The track generator does not finish');
        generator.currentStep();
        generator.updateIndicators();
    }
    return generator.getCode();
}

/**
 * Entities of a section of a track code, in the base 32 text of the original track codes, sorted
 * to compare codes regardless of the order: the solid lines, the scenery lines and the items of
 * the main layer, then the solid lines and the scenery lines of the foreground layer.
 */
function entities(code: string, section: number): string[] {
    const [main, foreground] = TrackFormat.read(code).layers;
    const polylines = (points: number[][]) =>
        points.map((polyline) => polyline.map((value) => value.toString(32)).join(' '));
    return [
        polylines(main.solid),
        polylines(main.scenery.flatMap((group) => group.polylines)),
        main.items.map(formatItem),
        polylines(foreground.solid),
        polylines(foreground.scenery.flatMap((group) => group.polylines)),
    ][section].sort();
}

describe('Track parser', () => {
    test('reads every section of a track code', () => {
        const track = parseTrack(FULL_TRACK);
        const main = track.layers.main[0].grid;
        const foreground = track.layers.foreground[0].grid;

        // The polyline is split into its two lines
        expect(main.totalSolidLines.size).toBe(3);
        expect(main.totalSceneryLines.size).toBe(1);
        // 9 items, the 2 teleporters counting as 2 items and the unknown item being ignored
        expect(main.totalObjects.size).toBe(10);
        expect(foreground.totalSolidLines.size).toBe(1);
        expect(foreground.totalSceneryLines.size).toBe(1);
        expect(foreground.totalObjects.size).toBe(0);

        expect(track.targets.size).toBe(1);
        // Every reachable item: checkpoint, target, teleporters, status effects
        expect(track.reachables.size).toBe(9);
        expect(track.playerRunner.bikeClass.bikeName).toBe('MTB');
        expect(track.origin).toMatchObject({ x: 10, y: -5 });
        expect(track.camera).toMatchObject({ x: 10, y: -5 });
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });

    test('reads base 32 coordinates', () => {
        const track = parseTrack('-a 1i 3v 0');
        const [line] = track.layers.main[0].grid.totalSolidLines.values();

        expect(line.pos).toMatchObject({ x: -10, y: 50 });
        expect(line.endPos).toMatchObject({ x: 127, y: 0 });
    });

    test('falls back to defaults when sections are missing', () => {
        const track = parseTrack(TRACK_DEFAULT);

        expect(track.layers.main[0].grid.totalSolidLines.size).toBe(1);
        expect(track.playerRunner.bikeClass.bikeName).toBe('BMX');
        expect(track.origin).toMatchObject({ x: 0, y: 0 });
    });

    test('falls back to the BMX for unknown bikes', () => {
        expect(parseTrack('#####Unicycle#0 0').playerRunner.bikeClass.bikeName).toBe('BMX');
    });

    test('ignores malformed entities', () => {
        const track = parseTrack('1 2 3,,0 0 a#T 1,C#####');

        expect(track.layers.main[0].grid.totalSolidLines.size).toBe(0);
        expect(track.layers.main[0].grid.totalObjects.size).toBe(0);
    });

    test('reports its progress while parsing, then while caching', () => {
        const parser = new TrackParser(new Track());
        parser.init('0 0 a 0,0 a a a#0 -a a -a#T 5 5###BMX#0 0');
        // The three empty sections of the foreground layer count as one empty entity each
        expect(parser.length).toBe(7);

        parser.currentStep();
        parser.updateIndicators();
        expect(parser.progressLabel).toBe('Solid lines (Main)');
        expect(parser.progress).toBe(2);

        while (!parser.caching) {
            parser.currentStep();
        }
        parser.updateIndicators();
        expect(parser.progressLabel).toBe('Cache (Main)');
    });

    test('runs as many steps as fit in a time budget', () => {
        // Enough items for several steps
        const items = Array.from({ length: 1000 }, (_, i) => `T ${i.toString(32)} 0`).join(',');
        const code = `0 0 a 0##${items}###BMX#0 0`;

        // A frame long enough parses the whole track
        const quick = new TrackParser(new Track());
        quick.init(code);
        quick.runFor(Infinity);
        expect(quick.done).toBe(true);
        expect(quick.track.layers.main[0].grid.totalObjects.size).toBe(1000);

        // Each step taking 5 ms, a budget of 12 ms runs three of them: the solid line, the empty
        // scenery, then the first items, the indicators following
        let now = 0;
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 5));
        const slow = new TrackParser(new Track());
        slow.init(code);
        slow.runFor(12);
        expect(slow.done).toBe(false);
        expect(slow.progressLabel).toBe('Items (Main)');
        expect(slow.progress).toBe(1 + 1 + 250);
        clock.mockRestore();
    });
});

describe('Track generator', () => {
    test('generates the code of a track, read back identically', () => {
        const code = generate(parseTrack(FULL_TRACK));
        const reparsed = generate(parseTrack(code));

        for (const section of [0, 1, 2, 3, 4]) {
            expect(entities(reparsed, section)).toEqual(entities(code, section));
        }
        expect(TrackFormat.read(code)).toMatchObject({ bike: 'MTB', origin: { x: 10, y: -5 } });
    });

    test('exports connected lines as a single polyline', () => {
        const code = generate(parseTrack('0 0 a 0 k 0 u 0#####BMX#0 0'));

        expect(entities(code, 0)).toEqual(['0 0 a 0 k 0 u 0']);
    });

    test('exports linked items with their group and items in their own format', () => {
        const code = generate(parseTrack(FULL_TRACK));

        expect(entities(code, 2)).toEqual([
            'B 7 7 -2s',
            'C 6 6',
            'E 5 6',
            'H 3 3',
            'I 2 2',
            'N 4 4',
            'R 1 1',
            'T 5 5',
            'W 8 8 9 9',
        ]);
    });

    test('can export the same track several times', () => {
        const track = parseTrack(FULL_TRACK);
        const first = generate(track);

        expect(generate(track)).toBe(first);
    });

    test('exports the edits of the track', () => {
        const track = parseTrack(FULL_TRACK);
        const teleporter = [...track.layers.main[0].grid.totalObjects.values()].find(
            (item) => item instanceof LinkedItem,
        );
        teleporter?.removeFromTrack();
        track.origin.set({ x: 32, y: 64 } as never);

        const code = generate(track);

        expect(entities(code, 2)).not.toContain('W 8 8 9 9');
        expect(TrackFormat.read(code).origin).toEqual({ x: 32, y: 64 });
    });

    test('reports its progress', () => {
        const generator = new TrackGenerator(parseTrack(FULL_TRACK));
        // Lines, scenery and items of both layers
        expect(generator.length).toBe(3 + 1 + 10 + 1 + 1);

        generator.currentStep();
        generator.updateIndicators();
        expect(generator.progress).toBe(3);
    });
});
