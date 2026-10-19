import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EDITOR_FORMAT, TrackFormat } from '../../src/openrider/parser/track-format';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';
import { Vector } from 'canvade';

/** Editor file with two main layers (one hidden) and a foreground layer. */
const EDITOR_CODE = JSON.stringify({
    format: EDITOR_FORMAT,
    version: 1,
    bike: 'MTB',
    origin: 'a -5',
    layers: [
        { name: 'Ground', type: 'main', solid: '-50 1i 50 1i,', items: 'T 0 0,' },
        { name: 'Decor', type: 'foreground', scenery: '0 0 a a,' },
        { name: 'Jumps', type: 'main', visible: false, solid: '0 a a 0 k a,', items: 'C 5 5,' },
    ],
});

/** Runs a generator to the end. */
function generate(track: Track): TrackGenerator {
    const generator = new TrackGenerator(track);
    while (!generator.done) {
        generator.currentStep();
    }
    return generator;
}

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Track format', () => {
    test('reads a track code as a main and a foreground layer', () => {
        const document = TrackFormat.read('0 0 a 0#1 1 2 2#T 5 5#3 3 4 4#5 5 6 6#MTB#a b');

        expect(document.layers).toEqual([
            {
                name: 'Main',
                type: 'main',
                visible: true,
                solid: '0 0 a 0',
                scenery: '1 1 2 2',
                items: 'T 5 5',
            },
            {
                name: 'Foreground',
                type: 'foreground',
                visible: true,
                solid: '3 3 4 4',
                scenery: '5 5 6 6',
                items: '',
            },
        ]);
        expect(document.bike).toBe('MTB');
        expect(document.origin).toBe('a b');
        // Missing sections fall back to the defaults
        expect(TrackFormat.read('').bike).toBe('BMX');
        expect(TrackFormat.read('').origin).toBe('0 0');
    });

    test('reads an editor file, with defaults for the missing fields', () => {
        expect(TrackFormat.isEditorCode(`  ${EDITOR_CODE}`)).toBe(true);
        expect(TrackFormat.isEditorCode('-18 1i 18 1i')).toBe(false);

        const document = TrackFormat.read(EDITOR_CODE);

        expect(document.layers.map((layer) => [layer.name, layer.type, layer.visible])).toEqual([
            ['Ground', 'main', true],
            ['Decor', 'foreground', true],
            ['Jumps', 'main', false],
        ]);
        expect(document.layers[1]).toMatchObject({ solid: '', items: '' });
        expect(document.bike).toBe('MTB');
        expect(
            TrackFormat.read(
                JSON.stringify({ format: EDITOR_FORMAT, version: 1, layers: [{ type: 'main' }] }),
            ),
        ).toMatchObject({ bike: 'BMX', origin: '0 0', layers: [{ name: 'Layer 1' }] });
    });

    test.each([
        ['{not json', 'The editor file is not valid JSON'],
        [JSON.stringify({ format: 'other' }), 'Not an OpenRider editor file'],
        [
            JSON.stringify({ format: EDITOR_FORMAT, version: 99 }),
            'Unsupported editor file version: 99',
        ],
        [JSON.stringify({ format: EDITOR_FORMAT, version: 1 }), 'The editor file has no layers'],
        [
            JSON.stringify({ format: EDITOR_FORMAT, version: 1, layers: [{ type: 'background' }] }),
            'Invalid layer #1 in the editor file',
        ],
        [
            JSON.stringify({ format: EDITOR_FORMAT, version: 1, layers: [{ type: 'foreground' }] }),
            'The editor file has no main layer',
        ],
    ])('refuses an invalid editor file: %s', (code, message) => {
        expect(() => TrackFormat.read(code)).toThrow(message);
    });

    test('writes a track code merging the layers of each type', () => {
        const document = TrackFormat.read(EDITOR_CODE);

        expect(TrackFormat.toTrackCode(document)).toBe(
            '-50 1i 50 1i,0 a a 0 k a,##T 0 0,C 5 5,##0 0 a a,#MTB#a -5',
        );
    });

    test('writes an editor file read back identically', () => {
        const document = TrackFormat.read(EDITOR_CODE);

        expect(TrackFormat.read(TrackFormat.toEditorCode(document))).toEqual(document);
    });
});

describe('Layered tracks', () => {
    test('parse every layer of an editor file, with its objects', () => {
        const track = parseTrack(EDITOR_CODE);
        const [ground, decor, jumps] = track.layers.all;

        expect(track.layers.all.map((layer) => layer.name)).toEqual(['Ground', 'Decor', 'Jumps']);
        expect(track.layers.active).toBe(ground);
        expect(jumps.visible).toBe(false);
        expect(ground.grid.totalSolidLines.size).toBe(1);
        expect(jumps.grid.totalSolidLines.size).toBe(2);
        expect(decor.grid.totalSceneryLines.size).toBe(1);
        expect(track.targets.size).toBe(1);
        expect(track.reachables.size).toBe(2);
        expect(track.playerRunner.bikeClass.bikeName).toBe('MTB');
    });

    test('generate editor files keeping the layers, and track codes merging them', () => {
        const track = parseTrack(EDITOR_CODE);
        const generator = generate(track);

        const editorDocument = TrackFormat.read(generator.getEditorCode());
        expect(
            editorDocument.layers.map((layer) => [layer.name, layer.type, layer.visible]),
        ).toEqual([
            ['Ground', 'main', true],
            ['Decor', 'foreground', true],
            ['Jumps', 'main', false],
        ]);
        expect(generator.getCode()).toBe(
            '-50 1i 50 1i,0 a a 0 k a,##T 0 0,C 5 5,##0 0 a a,#MTB#a -5',
        );
        // Exporting again gives the same files
        expect(generate(track).getEditorCode()).toBe(generator.getEditorCode());
    });

    test('convert a track code into an editor file', () => {
        const track = parseTrack('-18 1i 18 1i#0 0 a a#T 1 1#0 -a a -a##BMX#0 0');

        const document = TrackFormat.read(generate(track).getEditorCode());

        expect(document.layers).toEqual([
            {
                name: 'Main',
                type: 'main',
                visible: true,
                solid: '-18 1i 18 1i,',
                scenery: '0 0 a a,',
                items: 'T 1 1,',
            },
            {
                name: 'Foreground',
                type: 'foreground',
                visible: true,
                solid: '0 -a a -a,',
                scenery: '',
                items: '',
            },
        ]);
    });

    test('collide with every main layer, never with the foreground layers', () => {
        const track = parseTrack('#####BMX#0 0');
        const upper = track.layers.add('main');
        const foreground = track.layers.foreground[0];
        for (const [layer, y] of [
            [upper, 50],
            [foreground, 30],
        ] as const) {
            const line = new SolidLine(new Vector(-100, y), new Vector(100, y), track);
            line.layer = layer;
            line.addToTrack();
        }
        const target = new Target(new Vector(0, 40), track);
        target.layer = upper;
        target.addToTrack();

        for (let tick = 0; tick < 50; tick++) {
            track.playerRunner.fixedUpdate();
        }

        // Fell through the foreground line, then stopped on the line of the upper main layer
        const wheel = track.playerRunner.instance?.backWheel;
        expect(wheel?.pos.y).toBeCloseTo(50 - (wheel?.size ?? 0), 0);
        expect(track.playerRunner.targetsReached.size).toBe(1);
    });
});
