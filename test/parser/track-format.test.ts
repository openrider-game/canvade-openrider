import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { EDITOR_FORMAT } from '../../src/openrider/parser/legacy-format';
import type { TrackDocument } from '../../src/openrider/parser/track-document';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/** Editor file of the original format with two main layers (one hidden) and a foreground layer. */
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

/** Adds a line to the active layer of a track. */
function addLine(track: Track, line: SolidLine | SceneryLine, color = 0): void {
    line.color = color;
    line.layer = track.layers.active;
    line.addToTrack();
}

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Original formats', () => {
    test('read a track code as a main and a foreground layer, its scenery grey', () => {
        const document = TrackFormat.read('0 0 a 0#1 1 2 2#T 5 5#3 3 4 4#5 5 6 6#MTB#a b');

        expect(document.layers).toEqual([
            {
                name: 'Main',
                type: 'main',
                visible: true,
                solid: [[0, 0, 10, 0]],
                scenery: [{ color: 0, polylines: [[1, 1, 2, 2]] }],
                items: [{ code: 'T', values: [5, 5] }],
            },
            {
                name: 'Foreground',
                type: 'foreground',
                visible: true,
                solid: [[3, 3, 4, 4]],
                scenery: [{ color: 0, polylines: [[5, 5, 6, 6]] }],
                items: [],
            },
        ]);
        expect(document.bike).toBe('MTB');
        expect(document.origin).toEqual({ x: 10, y: 11 });
        // Missing sections fall back to the defaults
        expect(TrackFormat.read('')).toMatchObject({ bike: 'BMX', origin: { x: 0, y: 0 } });
    });

    test('skip the malformed entities, splitting a polyline at an invalid point', () => {
        const document = TrackFormat.read('0 0 a 0 x! 1 k 0 u 0 10 0,1 2 3,0 0 a##T 1,C,B 1 2 zz');

        expect(document.layers[0].solid).toEqual([
            [0, 0, 10, 0],
            [20, 0, 30, 0, 32, 0],
        ]);
        // An invalid value of an item is 0, as the command blocks always read them
        expect(document.layers[0].items).toEqual([{ code: 'B', values: [1, 2, 0] }]);
    });

    test('read an editor file, with defaults for the missing fields', () => {
        expect(TrackFormat.isEditorCode(`  ${EDITOR_CODE}`)).toBe(true);
        expect(TrackFormat.isEditorCode('-18 1i 18 1i')).toBe(false);

        const document = TrackFormat.read(EDITOR_CODE);

        expect(document.layers.map((layer) => [layer.name, layer.type, layer.visible])).toEqual([
            ['Ground', 'main', true],
            ['Decor', 'foreground', true],
            ['Jumps', 'main', false],
        ]);
        expect(document.layers[1]).toMatchObject({ solid: [], items: [] });
        expect(document.bike).toBe('MTB');
        expect(
            TrackFormat.read(
                JSON.stringify({ format: EDITOR_FORMAT, version: 1, layers: [{ type: 'main' }] }),
            ),
        ).toMatchObject({ bike: 'BMX', origin: { x: 0, y: 0 }, layers: [{ name: 'Layer 1' }] });
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
    ])('refuse an invalid editor file: %s', (code, message) => {
        expect(() => TrackFormat.read(code)).toThrow(message);
    });
});

describe('Track files', () => {
    test('keep the layers of an editor file, read back identically', () => {
        const document = TrackFormat.read(EDITOR_CODE);
        const bytes = TrackFormat.encode(document, true);

        expect([...bytes.subarray(0, 4)]).toEqual([0x4f, 0x52, 1, 1]);
        expect(TrackFormat.isEditorCode(bytes)).toBe(true);
        expect(TrackFormat.read(bytes)).toEqual(document);
    });

    test('merge the layers of each type into a track code', () => {
        const document = TrackFormat.read(TrackFormat.toTrackCode(TrackFormat.read(EDITOR_CODE)));

        expect(TrackFormat.isEditorCode(TrackFormat.toTrackCode(document))).toBe(false);
        expect(document).toEqual({
            layers: [
                {
                    name: 'Main',
                    type: 'main',
                    visible: true,
                    solid: [
                        [-160, 50, 160, 50],
                        [0, 10, 10, 0, 20, 10],
                    ],
                    scenery: [],
                    items: [
                        { code: 'T', values: [0, 0] },
                        { code: 'C', values: [5, 5] },
                    ],
                },
                {
                    name: 'Foreground',
                    type: 'foreground',
                    visible: true,
                    solid: [],
                    scenery: [{ color: 0, polylines: [[0, 0, 10, 10]] }],
                    items: [],
                },
            ],
            bike: 'MTB',
            origin: { x: 10, y: -5 },
        });
    });

    test('keep the scenery colors, the items in their order and their values', () => {
        const document: TrackDocument = {
            layers: [
                {
                    name: 'Main',
                    type: 'main',
                    visible: true,
                    solid: [[-100000, 3, 100000, -7, 5, 5]],
                    scenery: [
                        { color: 0, polylines: [[0, 0, 1, 1]] },
                        {
                            color: 7,
                            polylines: [
                                [2, 2, 3, 3],
                                [-4, -4, 9, 9],
                            ],
                        },
                    ],
                    items: [
                        { code: 'B', values: [7, 7, -90] },
                        { code: 'T', values: [-5, 6] },
                        { code: 'A', values: [1, 2, 0, 150] },
                        { code: 'B', values: [8, 8, 45] },
                        { code: 'A', values: [3, 4, 3, 1, 2, 3, 4, 0, -64, 75] },
                        { code: 'W', values: [1, 1, 900, 900] },
                    ],
                },
                {
                    name: 'Foreground',
                    type: 'foreground',
                    visible: true,
                    solid: [],
                    scenery: [],
                    items: [],
                },
            ],
            bike: 'BMX',
            origin: { x: -3, y: 4 },
        };

        expect(TrackFormat.read(TrackFormat.toTrackCode(document))).toEqual(document);
    });

    test('travel as base 64 text, which no original format starts as', () => {
        const bytes = TrackFormat.encode(TrackFormat.read(EDITOR_CODE), false);
        const text = TrackFormat.toText(bytes);

        expect(text.startsWith('T1I')).toBe(true);
        expect(TrackFormat.fromText(text)).toEqual(bytes);
        expect(TrackFormat.fromText('-18 1i 18 1i')).toBeNull();
        expect(TrackFormat.fromText(EDITOR_CODE)).toBeNull();
    });

    test('are refused when truncated, corrupted or of a newer version', () => {
        const bytes = TrackFormat.encode(TrackFormat.read(EDITOR_CODE), true);

        expect(() => TrackFormat.read(bytes.subarray(0, 6))).toThrow('The track file is truncated');
        expect(() => TrackFormat.read(bytes.subarray(0, bytes.length - 4))).toThrow();
        const corrupted = bytes.slice();
        corrupted.fill(0xff, 12);
        expect(() => TrackFormat.read(corrupted)).toThrow();
        const newer = bytes.slice();
        newer[2] = 2;
        expect(() => TrackFormat.read(newer)).toThrow('Unsupported track file version: 2');
    });

    test('are smaller than the original track codes', () => {
        // Rough terrain: a long polyline of small steps, as drawn with the brush
        const points = Array.from({ length: 2000 }, (_, i) => [
            i * 15,
            Math.round(Math.sin(i / 7) * 60 + i),
        ]).flat();
        const code = `${points.map((value) => value.toString(32)).join(' ')}#####BMX#0 0`;

        const bytes = TrackFormat.encode(TrackFormat.read(code), false);

        expect(bytes.length).toBeLessThan(code.length / 3);
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
        const document = TrackFormat.read(generator.getCode());
        expect(document.layers.map((layer) => [layer.name, layer.solid])).toEqual([
            [
                'Main',
                [
                    [-160, 50, 160, 50],
                    [0, 10, 10, 0, 20, 10],
                ],
            ],
            ['Foreground', []],
        ]);
        // Exporting again gives the same files
        expect(generate(track).getEditorCode()).toEqual(generator.getEditorCode());
        expect(generate(track).getCode()).toEqual(generator.getCode());
    });

    test('convert a track code of the original format into an editor file', () => {
        const track = parseTrack('-18 1i 18 1i#0 0 a a#T 1 1#0 -a a -a##BMX#0 0');

        const document = TrackFormat.read(generate(track).getEditorCode());

        expect(document.layers).toEqual([
            {
                name: 'Main',
                type: 'main',
                visible: true,
                solid: [[-40, 50, 40, 50]],
                scenery: [{ color: 0, polylines: [[0, 0, 10, 10]] }],
                items: [{ code: 'T', values: [1, 1] }],
            },
            {
                name: 'Foreground',
                type: 'foreground',
                visible: true,
                solid: [[0, -10, 10, -10]],
                scenery: [],
                items: [],
            },
        ]);
    });

    test('export scenery by color, a polyline never changing color', () => {
        const track = parseTrack('#####BMX#0 0');
        const point = (x: number) => new Vector(x, 0);
        // Grey, grey, then rose from the same end point, then rose again
        addLine(track, new SceneryLine(point(0), point(10), track));
        addLine(track, new SceneryLine(point(10), point(20), track));
        addLine(track, new SceneryLine(point(20), point(30), track), 1);
        addLine(track, new SceneryLine(point(30), point(40), track), 1);

        const document = TrackFormat.read(generate(track).getCode());

        expect(document.layers[0].scenery).toEqual([
            { color: 0, polylines: [[0, 0, 10, 0, 20, 0]] },
            { color: 1, polylines: [[20, 0, 30, 0, 40, 0]] },
        ]);
        // Read back with their colors
        const parsed = parseTrack(generate(track).getCode());
        const colors = [...parsed.layers.main[0].grid.totalSceneryLines.values()].map(
            (line) => line.color,
        );
        expect(colors).toEqual([0, 0, 1, 1]);
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
