import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_SELECTED_OBJECTS } from '../../src/openrider/edit/edit-limits';
import { ObjectClipboard } from '../../src/openrider/edit/object-clipboard';
import { unitOf, codeOf } from '../../src/openrider/edit/edit-objects';
import { CommandBlock } from '../../src/openrider/item/command/command-block';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import type { TrackObject } from '../../src/openrider/item/track-object';
import { SelectTool } from '../../src/openrider/tool/misc/select.tool';
import type { Track } from '../../src/openrider/track/track';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { mouseEvent, moveMouse, parseTrack } from '../helpers/track';

/**
 * A line from (0, 0) to (100, 0), a target at (50, 20), a teleporter from (30, 40) to (500, 40),
 * and a command block at (60, 20) hiding the area (200, -50) to (300, 50).
 */
const TRACK = '0 0 34 0##T 1i k,W u 18 fk 18,A 1s k 2 68 -1i 9c 1i,#0 -a a -a##BMX#0 0';

let track: Track;
let tool: SelectTool;

beforeEach(() => {
    stubBrowser();
    vi.stubGlobal('navigator', {});
    ObjectClipboard.content = [];
    track = parseTrack(TRACK);
    tool = new SelectTool(track);
    track.toolCollection.add(tool);
    track.toolManager.setTool(tool);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Presses at a world position and releases at another one. */
function drag(from: [number, number], to: [number, number]): void {
    moveMouse(track, ...from);
    track.toolManager.onMouseDown(mouseEvent());
    moveMouse(track, ...to);
    track.toolManager.onMouseMove(mouseEvent());
    track.toolManager.onMouseUp(mouseEvent());
}

const objects = (): TrackObject[] => [
    ...track.layers.main[0].grid.totalSolidLines.values(),
    ...track.layers.main[0].grid.totalObjects.values(),
];
const codes = () => objects().map((object) => codeOf(unitOf(object)));
const labels = () => tool.getOptions().map(({ label }) => label);

describe('Select tool', () => {
    test('selects the objects fully inside the area dragged, a click letting go of them', () => {
        drag([-10, -10], [110, 30]);

        // The line, the target and the block; not the teleporter, beyond the area
        expect(tool.selected).toHaveLength(3);
        expect(labels()).toEqual([
            'Selected: 3 objects',
            'Copy',
            'Cut',
            'Delete',
            'Save as template',
            'Template: private',
            'Templates',
        ]);

        drag([1000, 1000], [1000, 1000]);
        expect(tool.selected).toHaveLength(0);
    });

    test('shows a crosshair at the pointer, with arrows over the selection and a filled handle', () => {
        /** Drawing calls of the tool at a pointer position. */
        const drawn = (x: number, y: number) => {
            moveMouse(track, x, y);
            track.mouseIn = true;
            track.toolManager.onMouseMove(mouseEvent());
            const { context, calls } = createCanvasMock();
            track.toolManager.render(context);
            return calls;
        };
        const lines = (calls: string[]) => calls.filter((call) => call === 'lineTo').length;

        // A plain crosshair: two arms
        const plain = drawn(500, 500);
        expect(lines(plain)).toBe(2);

        drag([-10, -10], [110, 30]);
        // Over the selection, an arrowhead at the end of each arm: a drag moves it
        const over = drawn(50, 10);
        const away = drawn(500, 500);
        expect(lines(over) - lines(away)).toBe(8);
        expect(away).not.toContain('fill');

        // Over the rotation handle, 30 pixels above the selection: filled, a drag turns it
        expect(drawn(50, -30 / track.zoomFactor)).toContain('fill');

        // Shown while dragging, the pointer pressed
        moveMouse(track, 200, 200);
        track.toolManager.onMouseDown(mouseEvent());
        track.mouseIn = false;
        const { context, calls } = createCanvasMock();
        track.toolManager.render(context);
        expect(lines(calls)).toBeGreaterThanOrEqual(2);
        track.toolManager.onMouseUp(mouseEvent());
    });

    test('refuses more objects than a selection holds', () => {
        for (let i = 0; i <= MAX_SELECTED_OBJECTS; i++) {
            const line = new SolidLine(
                new Vector(-600 + (i % 100) * 5, -600 + Math.floor(i / 100) * 5),
                new Vector(-597 + (i % 100) * 5, -597 + Math.floor(i / 100) * 5),
                track,
            );
            line.layer = track.layers.main[0];
            line.addToTrack();
        }

        drag([-610, -610], [-80, -80]);

        expect(tool.selected).toHaveLength(0);
        expect(labels()[0]).toBe(
            `Too many objects: ${MAX_SELECTED_OBJECTS + 1} / ${MAX_SELECTED_OBJECTS}`,
        );
    });

    test('moves the selection as a single edit, the command block without its area', () => {
        drag([-10, -10], [110, 30]);
        drag([50, 0], [82, 32]);

        expect(codes()).toEqual(
            expect.arrayContaining(['10 10 44 10', 'T 2i 1k', 'A 2s 1k 2 68 -1i 9c 1i']),
        );
        // Still selected, as moved
        expect(tool.selected).toHaveLength(3);
        track.history.undo();
        expect(codes()).toEqual(
            expect.arrayContaining(['0 0 34 0', 'T 1i k', 'A 1s k 2 68 -1i 9c 1i']),
        );
    });

    test('turns the selection freely around its center with the handle above it', () => {
        drag([-10, -10], [110, 10]);
        // The line alone: centered on (50, 0), its handle 30 pixels above at zoom 1
        const handle = new Vector(50, -30 / track.zoomFactor);

        // A quarter turn clockwise
        drag([handle.x, handle.y], [50 + 100, 0]);

        expect(codes()).toContain('1i -1i 1i 1i');
    });

    test('moves the items of a linked group selected alone, the others staying', () => {
        drag([20, 30], [40, 50]);
        expect(tool.selected).toEqual([expect.any(LinkedItem)]);

        drag([30, 40], [30, 104]);

        expect(codes()).toContain('W u 38 fk 18');
    });

    test('copies, then pastes around the pointer, selecting the objects pasted', () => {
        drag([-10, -10], [110, 30]);
        tool.copy();
        expect(labels()).toContain('Paste');

        tool.paste();
        expect(tool.pasted).toHaveLength(3);
        drag([1000, 1000], [1000, 1000]);

        // Centered on the pointer: the copy was centered on (50, 10)
        expect(codes()).toEqual(
            expect.arrayContaining(['tm uu 10q uu', 'T v8 vi', 'A vi vi 2 68 -1i 9c 1i']),
        );
        expect(tool.selected).toHaveLength(3);
        expect(tool.pasted).toBeNull();
    });

    test('pastes a track code from the clipboard of the browser, and copies to it', () => {
        const data = new Map<string, string>();
        const clipboard = {
            clipboardData: {
                setData: (type: string, text: string) => data.set(type, text),
                getData: (type: string) => data.get(type) ?? '',
            },
        } as unknown as ClipboardEvent;

        // A polyline of two lines and a target, as in a track code
        data.set('text/plain', '0 0 a 0 a a#-50 1i 1k0 1i#T 0 0#BMX#0 0');
        expect(tool.onClipboard('paste', clipboard)).toBe(true);
        expect(tool.pasted).toHaveLength(4);
        drag([0, 0], [0, 0]);

        drag([-200, -200], [200, 200]);
        expect(tool.onClipboard('copy', clipboard)).toBe(true);
        expect(ObjectClipboard.fromText(data.get('text/plain')!)?.length).toBeGreaterThan(4);

        // Any other text is not taken without objects copied before
        ObjectClipboard.content = [];
        data.set('text/plain', 'hello#world#!');
        expect(tool.onClipboard('paste', clipboard)).toBe(false);
    });

    test('cuts and deletes, Delete and Escape working from the keyboard', () => {
        drag([-10, -10], [110, 30]);
        tool.cut();
        expect(objects().some((object) => object instanceof CommandBlock)).toBe(false);
        expect(ObjectClipboard.content).toHaveLength(3);

        drag([20, 30], [600, 50]);
        expect(tool.onKeyDown({ key: 'Escape' } as KeyboardEvent)).toBe(true);
        expect(tool.selected).toHaveLength(0);

        drag([20, 30], [600, 50]);
        expect(tool.onKeyDown({ key: 'Delete' } as KeyboardEvent)).toBe(true);
        expect(objects()).toHaveLength(0);
        track.history.undo();
        expect(objects()).toHaveLength(2);
    });

    describe('with the templates of the website', () => {
        /** Answers of the templates endpoint, by action, and the requests posted. */
        let posted: Array<Record<string, string>>;
        function serve(answers: Record<string, unknown>): void {
            posted = [];
            vi.stubGlobal(
                'fetch',
                vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
                    const params = Object.fromEntries(init.body.entries());
                    posted.push(params);
                    return { ok: true, json: async () => answers[params.action] } as Response;
                }),
            );
        }

        test('saves the selection, private unless chosen public, named in a dialog', async () => {
            serve({ save: { ID: 4 } });
            vi.stubGlobal('window', { prompt: () => ' Bridge ' });
            drag([-10, -10], [110, 30]);
            tool.getOptions().find(({ label }) => label === 'Template: private')!.action!();

            await tool.saveTemplate();

            expect(posted).toHaveLength(1);
            expect(posted[0]).toMatchObject({ action: 'save', name: 'Bridge', public: '1' });
            expect(ObjectClipboard.fromText(posted[0].code)).toHaveLength(3);
            // The thumbnail, as base64 PNG data without its prefix
            expect(posted[0].thumbnail).toBe('iVBORw0KGgo=');
            expect(labels()[0]).toBe('Saved the template Bridge');
        });

        test('lists the templates a page at a time, and pastes one', async () => {
            const rows = Array.from({ length: 8 }, (_, i) => ({
                ID: i + 1,
                NAME: `Jump ${i + 1}`,
                OBJECTS: 2,
                PUBLIC: i > 0,
                AUTHOR: i < 2 ? 'Me' : 'Other',
                MINE: i < 2,
            }));
            serve({ list: { TEMPLATES: rows }, get: { CODE: '0 0 a 0##T 0 -a' } });

            await tool.browseTemplates();
            expect(labels()).toEqual([
                'Back',
                'Jump 1 (2)',
                'Jump 2 (2, public)',
                'Jump 3 (2, by Other)',
                'Jump 4 (2, by Other)',
                'Jump 5 (2, by Other)',
                'Jump 6 (2, by Other)',
                'Page 1 / 2',
            ]);
            tool.getOptions().at(-1)!.steps!.up();
            expect(labels().slice(1)).toEqual([
                'Jump 7 (2, by Other)',
                'Jump 8 (2, by Other)',
                'Page 2 / 2',
            ]);

            await tool.insertTemplate({
                id: 8,
                name: 'Jump 8',
                objects: 2,
                public: true,
                author: 'Other',
                mine: false,
            });
            expect(posted.at(-1)).toMatchObject({ action: 'get', id: '8' });
            expect(tool.pasted).toHaveLength(2);
        });

        test('tell the error of the website, e.g. without an account', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => ({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    json: async () => ({ error: 'Log in to use the templates' }),
                })),
            );

            await tool.browseTemplates();

            expect(labels()).toEqual(['Log in to use the templates', 'Back']);
        });
    });
});
