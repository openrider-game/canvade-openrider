import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { invertEdit, TrackEdit } from '../../src/openrider/edit/track-edit';
import { TrackEditor } from '../../src/openrider/edit/track-editor';
import {
    CommandBlock,
    defaultCommandSettings,
} from '../../src/openrider/item/command/command-block';
import { Boost } from '../../src/openrider/item/directional/boost';
import { LinkedItemGroup } from '../../src/openrider/item/linked-item-group';
import { Teleporter } from '../../src/openrider/item/linked/teleporter';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import type { TrackObject } from '../../src/openrider/item/track-object';
import { TrackGenerator } from '../../src/openrider/parser/track-generator';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack } from '../helpers/track';

/** Lines, items (a teleporter pair among them) and a foreground layer. */
const TRACK_CODE =
    '0 0 a 0 k 0,0 a a a#0 -a a -a#T 5 5,C 6 6,B 7 7 -2s,W 8 8 9 9,R 1 1#0 1 a 1#0 2 a 2#BMX#a -5';

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * Content of a track, as exported: its layers, each one with its lines one by one and its items,
 * sorted, so that the order of the objects and their grouping in polylines do not count.
 */
function content(track: Track) {
    const generator = new TrackGenerator(track);
    while (!generator.done) {
        generator.currentStep();
    }
    const segments = (polylines: string) =>
        polylines
            .split(',')
            .filter(Boolean)
            .flatMap((polyline) => {
                const points = polyline.split(' ');
                return points
                    .slice(0, -2)
                    .flatMap((_, i) => (i % 2 ? [] : [points.slice(i, i + 4).join(' ')]));
            })
            .sort();
    return generator.getDocument().layers.map((layer) => ({
        name: layer.name,
        type: layer.type,
        solid: segments(layer.solid),
        scenery: segments(layer.scenery),
        items: layer.items.split(',').filter(Boolean).sort(),
    }));
}

/** Places an object on a layer, as the tools do before adding it. */
function on<T extends TrackObject>(object: T, track: Track, layer = track.layers.active): T {
    object.layer = layer;
    return object;
}

/** A teleporter pair, as the linked item tool builds it. */
function teleporters(track: Track): LinkedItemGroup {
    const group = new LinkedItemGroup(track);
    for (const pos of [new Vector(40, 40), new Vector(60, 40)]) {
        const teleporter = new Teleporter(pos, track);
        teleporter.group = group;
        group.instances.push(teleporter);
    }
    return group;
}

/**
 * Edits a track as an editor would: lines, a shape, items of every kind of code, erasing drawn
 * and parsed objects, and every edit of the layers, with undo and redo along the way.
 */
function editTrack(track: Track): void {
    const { editor, layers, history } = track;
    editor.add([on(new SolidLine(new Vector(0, 50), new Vector(100, 50), track), track)]);
    // A brush stroke, its lines undone together
    history.startGroup();
    editor.add([on(new SolidLine(new Vector(100, 50), new Vector(150, 60), track), track)]);
    editor.add([on(new SolidLine(new Vector(150, 60), new Vector(200, 80), track), track)]);
    history.endGroup();
    editor.add([
        on(new SceneryLine(new Vector(0, -50), new Vector(30, -80), track), track),
        on(new SceneryLine(new Vector(30, -80), new Vector(60, -50), track), track),
    ]);
    editor.add([on(new Target(new Vector(20, 20), track), track)]);
    editor.add([on(new Boost(new Vector(30, 20), 45, track), track)]);
    editor.add([on(teleporters(track), track)]);
    const settings = { ...defaultCommandSettings(), kind: 'zoom' as const, zoom: 1.5 };
    editor.add([on(new CommandBlock(new Vector(50, 20), settings, track), track)]);

    // Erasing a drawn line, a parsed line and a parsed teleporter: as the eraser does
    const erased = track.checkDelete(
        new Vector(50, 50),
        5,
        { solid: true, scenery: false, item: false },
        layers.main,
    );
    erased.push(
        ...track.checkDelete(
            new Vector(5, 0),
            2,
            { solid: true, scenery: false, item: false },
            layers.main,
        ),
    );
    erased.push(
        ...track.checkDelete(
            new Vector(8, 8),
            2,
            { solid: false, scenery: false, item: true },
            layers.main,
        ),
    );
    expect(erased.length).toBeGreaterThanOrEqual(3);
    editor.recordRemoved(erased);

    // Layers: added, drawn on, renamed, moved, then the foreground one removed with its lines
    const upper = layers.add('main');
    editor.add([on(new SolidLine(new Vector(0, 200), new Vector(80, 200), track), track, upper)]);
    layers.rename(upper, 'Bridge');
    layers.move(upper, -1);
    layers.remove(layers.foreground[0]);

    // Undone and redone along the way
    history.undo().undo().redo();
}

describe('Track editor', () => {
    test('numbers the objects and layers of a parsed track the same on every screen', () => {
        // The items of a linked pair are added and removed with their group, which has the id
        const ids = (track: Track) =>
            track.layers.all.flatMap((layer) => [
                layer.uid,
                ...new Set(layer.objects().map((object) => TrackEditor.unitOf(object).uid)),
            ]);
        const first = ids(parseTrack(TRACK_CODE));

        expect(first).toEqual(ids(parseTrack(TRACK_CODE)));
        expect(first.filter((uid) => uid?.startsWith('L'))).toEqual(['L0', 'L1']);
        // Every object numbered, once: 3 solid lines, 1 scenery line, 5 items, 2 foreground lines
        const objects = first.filter((uid) => uid?.startsWith('p'));
        expect(new Set(objects).size).toBe(objects.length);
        expect(objects).toHaveLength(11);
    });

    test('makes edits of plain data, which give the same track on another screen', () => {
        const track = parseTrack(TRACK_CODE);
        const edits: TrackEdit[] = [];
        track.editor.onEdit = (edit) => edits.push(JSON.parse(JSON.stringify(edit)));
        editTrack(track);

        // Another screen editing the same track, given the edits
        const other = parseTrack(TRACK_CODE);
        edits.forEach((edit) => other.editor.apply(edit));

        expect(content(other)).toEqual(content(track));
        // The layer moved under the main one, the removal of the foreground one undone
        expect(content(track).map((layer) => layer.name)).toEqual(['Bridge', 'Main', 'Foreground']);
    });

    test('undoes every edit, back to the parsed track', () => {
        const track = parseTrack(TRACK_CODE);
        const parsed = content(track);
        editTrack(track);
        for (let i = 0; i < 50; i++) {
            track.history.undo();
        }

        expect(content(track)).toEqual(parsed);
        // Redone up to the last edit, the removal of the foreground layer undone at the end
        for (let i = 0; i < 50; i++) {
            track.history.redo();
        }
        const redone = parseTrack(TRACK_CODE);
        editTrack(redone);
        redone.history.redo();
        expect(content(track)).toEqual(content(redone));
    });

    test('applies an edit once, whatever was applied before', () => {
        const track = parseTrack(TRACK_CODE);
        const edits: TrackEdit[] = [];
        track.editor.onEdit = (edit) => edits.push(edit);
        const [line] = track.editor.add([
            on(new SolidLine(new Vector(0, 50), new Vector(100, 50), track), track),
        ]);
        const before = content(track);

        // Added twice, removed twice, a missing layer edited: nothing more happens
        track.editor.apply(edits[0]);
        expect(content(track)).toEqual(before);
        const remove = invertEdit(edits[0]);
        track.editor.apply(remove);
        track.editor.apply(remove);
        expect(line.onTrack).toBe(false);
        track.editor.apply({ type: 'renameLayer', layer: 'missing', from: 'a', to: 'b' });
        track.editor.apply({ type: 'moveLayer', layer: 'missing', from: 0, to: 1 });
        // Undoing the line removed by someone else does nothing either
        track.history.undo();
        expect(line.onTrack).toBe(false);
    });

    test('leaves the exports whole, the edits describing items without marking them', () => {
        const track = parseTrack(TRACK_CODE);
        const parsed = content(track);
        // The parsed teleporters, erased and put back
        const erased = track.checkDelete(
            new Vector(8, 8),
            2,
            { solid: false, scenery: false, item: true },
            track.layers.main,
        );
        track.editor.recordRemoved(erased);
        track.history.undo();

        expect(content(track)).toEqual(parsed);
        expect(content(track)[0].items).toContain('W 8 8 9 9');
    });
});
