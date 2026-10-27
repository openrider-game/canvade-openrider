import { EventFactory, Mouse, State, StateClass, StateManager, Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EDITOR_FORMAT, TrackFormat } from '../../src/openrider/parser/track-format';
import { Session } from '../../src/states/session';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_PARSER,
    STATE_TRACK_UPLOAD,
} from '../../src/states/state-names';
import States from '../../src/states/states';
import { TrackEditingState } from '../../src/states/track/track-editing.state';
import { layoutGroup } from '../../src/states/track/layers/track-interface.layer';
import { ToolGroupTool } from '../../src/openrider/tool/group/tool-group.tool';
import { TrackUploadState } from '../../src/states/track-upload/track-upload.state';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';

const EDITOR_CODE = JSON.stringify({
    format: EDITOR_FORMAT,
    version: 1,
    layers: [
        { name: 'Ground', type: 'main', solid: '-50 1i 50 1i,' },
        { name: 'Glass', type: 'foreground', solid: '0 0 a a,' },
        { name: 'Ramps', type: 'main', solid: '0 a a 0,' },
    ],
});

let manager: StateManager;
let session: Session;

async function runUntil(stateName: string, frames = 400): Promise<void> {
    const state = manager.getState(stateName);
    for (let frame = 0; frame < frames && manager.getCurrent() !== state; frame++) {
        manager.fixedUpdate();
        manager.update(0.5, 20);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(manager.getCurrent()?.constructor.name).toBe(state?.constructor.name);
}

/** Runs frames, rebuilding the interface, and returns the texts drawn by the last one. */
function frame(): string[] {
    const { context } = createCanvasMock();
    manager.update(0.5, 20);
    manager.render(context);
    return vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
}

function click(x: number, y: number): void {
    for (const name of ['pointerDown', 'pointerUp']) {
        Mouse.worldPos.set(new Vector(x, y));
        manager.getCurrent()?.dispatch(
            name as 'pointerDown',
            EventFactory.createGameEvent({
                name,
                consumed: false,
                position: new Vector(x, y),
                pointerEvent: { pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent,
                primary: true,
            }),
        );
    }
    frame();
}

function wheel(x: number, y: number, deltaY: number): void {
    manager.getCurrent()?.dispatch(
        'scroll',
        EventFactory.createGameEvent({
            name: 'scroll',
            consumed: false,
            position: new Vector(x, y),
            wheelEvent: { deltaY, deltaMode: 0 } as WheelEvent,
            viewWidth: 700,
            viewHeight: 400,
        }),
    );
    frame();
}

function type(key: string): void {
    manager.getCurrent()?.dispatch(
        'keyDown',
        EventFactory.createGameEvent({
            name: 'keyDown',
            consumed: false,
            keyboardEvent: { key, ctrlKey: false, altKey: false, metaKey: false } as KeyboardEvent,
        }),
    );
}

/**
 * Positions in the layers panel of the 700 x 400 test canvas, for a number of layers: the panel
 * is 230 pixels wide, 64 pixels from the right edge and 10 from the bottom edge.
 */
function panel(layerCount: number) {
    const height = 8 + 22 + 22 + 22 * layerCount + 22;
    const top = 400 - 10 - height;
    const left = 700 - 64 - 230 + 4;
    const rowY = (row: number) => top + 4 + 44 + 22 * row + 11;
    return {
        input: { x: left + 100, y: top + 4 + 22 + 11 },
        visibility: (row: number) => ({ x: left + 15, y: rowY(row) }),
        select: (row: number) => ({ x: left + 80, y: rowY(row) }),
        up: (row: number) => ({ x: left + 167, y: rowY(row) }),
        remove: (row: number) => ({ x: left + 211, y: rowY(row) }),
        addMain: { x: left + 50, y: rowY(layerCount) },
        addForeground: { x: left + 160, y: rowY(layerCount) },
    };
}

beforeEach(() => {
    stubBrowser();
    manager = new StateManager();
    session = new Session(manager.shared);
    for (const { name, state } of Object.values(States)) {
        manager.addState(state as StateClass<State>, name);
    }
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Layers panel', () => {
    test('edits the layers of the track', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const layers = session.track.layers;
        expect(frame()).toEqual(
            expect.arrayContaining(['Layers (2) ▼', 'Foreground (fg)', 'Main', '+ Main']),
        );

        // Added above the active layer, then listed first
        const add = panel(2).addMain;
        click(add.x, add.y);
        expect(layers.all.map((layer) => layer.name)).toEqual(['Main', 'Main 2', 'Foreground']);
        expect(layers.active.name).toBe('Main 2');

        // Rows from the top layer: Foreground, Main 2, Main
        const rows = panel(3);
        click(rows.visibility(0).x, rows.visibility(0).y);
        expect(layers.foreground[0].visible).toBe(false);
        expect(frame()).toContain('off');

        click(rows.select(2).x, rows.select(2).y);
        expect(layers.active.name).toBe('Main');

        click(rows.input.x, rows.input.y);
        for (const key of [
            'Backspace',
            'Backspace',
            'Backspace',
            'Backspace',
            'R',
            'o',
            'c',
            'k',
        ]) {
            type(key);
        }
        type('Enter');
        expect(layers.active.name).toBe('Rock');

        click(rows.up(2).x, rows.up(2).y);
        expect(layers.all.map((layer) => layer.name)).toEqual(['Main 2', 'Rock', 'Foreground']);

        // Rows: Foreground, Rock, Main 2
        click(rows.remove(2).x, rows.remove(2).y);
        expect(layers.all.map((layer) => layer.name)).toEqual(['Rock', 'Foreground']);

        // Rows: Foreground, Rock, the last main layer, which cannot be removed
        const rest = panel(2);
        click(rest.remove(1).x, rest.remove(1).y);
        expect(layers.main).toHaveLength(1);
        click(rest.remove(0).x, rest.remove(0).y);
        expect(layers.all.map((layer) => layer.name)).toEqual(['Rock']);
    });

    test('scrolls through many layers, and slides down to its title', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const layers = session.track.layers;
        for (let i = 0; i < 5; i++) {
            layers.add('main');
        }
        frame();
        // Seven layers in a list of six rows: Foreground, Main 6, Main 5... Main
        const top = 400 - 10 - (8 + 3 * 22 + 6 * 22);
        const left = 700 - 64 - 230 + 4;
        const firstRow = { x: left + 80, y: top + 4 + 44 + 11 };
        const zoom = session.track.zoomFactor;

        // Scrolled by the wheel, within the 22 pixels of overflow, instead of zooming the track
        wheel(firstRow.x, firstRow.y, 15);
        wheel(firstRow.x, firstRow.y, 100);
        expect(session.track.zoomFactor).toBe(zoom);
        click(firstRow.x, firstRow.y);
        expect(layers.active.name).toBe('Main 6');

        // Kept when the interface is rebuilt
        click(firstRow.x, firstRow.y);
        expect(layers.active.name).toBe('Main 6');

        // The title slides down to the bottom of the canvas, then back up
        click(left + 100, top + 4 + 11);
        expect(frame()).toContain('Layers (7) ▲');
        for (let i = 0; i < 12; i++) {
            frame();
        }
        const closedTop = 400 - 10 - (8 + 22);
        click(firstRow.x, firstRow.y);
        expect(layers.active.name).toBe('Main 6');
        click(left + 100, closedTop + 4 + 11);
        for (let i = 0; i < 12; i++) {
            frame();
        }
        expect(frame()).toContain('Layers (7) ▼');
        click(left + 80, firstRow.y + 22);
        expect(layers.active.name).toBe('Main 5');
    });

    test('is not displayed while racing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ CODE: EDITOR_CODE }))),
        );
        session.trackId = 3;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil('trackRacing');

        expect(frame().some((text) => text.startsWith('Layers'))).toBe(false);
        expect(session.track.layers.all).toHaveLength(3);
    });
});

describe('Tool groups', () => {
    test('lay their tools out in columns fitting the canvas height', () => {
        // Fits under its button
        expect(layoutGroup(4, 100, 400)).toEqual({ top: 100, rows: 4, columns: 1 });
        // Moved up to fit
        expect(layoutGroup(10, 182, 400)).toEqual({ top: 140, rows: 10, columns: 1 });
        // In balanced columns when taller than the canvas
        expect(layoutGroup(10, 182, 200)).toEqual({ top: 70, rows: 5, columns: 2 });
        expect(layoutGroup(10, 0, 100)).toEqual({ top: 0, rows: 3, columns: 4 });
        // Under its button while the canvas size is unknown
        expect(layoutGroup(10, 182, Infinity)).toEqual({ top: 182, rows: 10, columns: 1 });
    });

    test('show all the tools of an open group in the canvas', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const track = session.track;
        track.toolCollection.getByToolName('Launcher')?.run();
        // The first frame renders the canvas, the next one lays the group out after its height
        frame();
        frame();

        // The item tools, the group being the 8th button of the right toolbar, laid out up to the
        // bottom of the 400 pixels high canvas, 30 pixels from the right edge: the last of them
        // was under the bottom edge before
        const group = track.toolCollection.getByToolName('Item Group') as ToolGroupTool;
        const count = group.instances.length;
        const { top } = layoutGroup(count, 7 * 26, 400);
        expect(top + count * 26).toBe(400);
        click(700 - 30 - 13, top + (count - 1) * 26 + 13);

        expect(track.toolManager.tool).toBe(group.instances[count - 1]);
    });
});

describe('Editor files', () => {
    test('are exported with every layer', async () => {
        const createObjectURL = vi.fn((blob: Blob) => blob && 'blob:track');
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
        session.trackCode = EDITOR_CODE;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        (manager.getCurrent() as TrackEditingState).getButtons()[2].action();
        await runUntil(STATE_TRACK_EDITING);

        const [blob] = createObjectURL.mock.calls[0];
        expect(blob.type).toBe('application/json');
        const document = TrackFormat.read(await blob.text());
        expect(document.layers.map((layer) => layer.name)).toEqual(['Ground', 'Glass', 'Ramps']);
    });

    test('are imported, an invalid file being refused', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const alert = vi.fn();
        vi.stubGlobal('alert', alert);
        const input = { files: [{}], addEventListener: vi.fn(), click: vi.fn() };
        let fileContent = '';
        vi.stubGlobal('document', {
            ...document,
            createElement: (tag: string) => (tag === 'input' ? input : document.createElement(tag)),
        });
        vi.stubGlobal(
            'FileReader',
            class {
                public result = '';
                private onLoad = () => {};
                public addEventListener(_name: string, listener: () => void) {
                    this.onLoad = listener;
                }
                public readAsText() {
                    this.result = fileContent;
                    this.onLoad();
                }
            },
        );
        const importFile = (content: string) => {
            fileContent = content;
            (manager.getCurrent() as TrackEditingState).getButtons()[0].action();
            const [, onChange] = input.addEventListener.mock.calls.at(-1) as [string, () => void];
            onChange();
        };

        importFile('{"format":"something else"}');
        expect(alert).toHaveBeenCalledWith(
            'This file cannot be imported: Not an OpenRider editor file',
        );
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_EDITING)).toBe(true);

        importFile(EDITOR_CODE);
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_PARSER)).toBe(true);
        await runUntil(STATE_TRACK_EDITING);
        expect(session.track.layers.all.map((layer) => layer.name)).toEqual([
            'Ground',
            'Glass',
            'Ramps',
        ]);
    });

    test('are uploaded, as well as track codes', async () => {
        const fetch = vi.fn(async () => new Response(JSON.stringify({ ID: 9 })));
        vi.stubGlobal('fetch', fetch);
        vi.stubGlobal('location', { href: '' });
        session.trackCode = EDITOR_CODE;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        frame();
        (manager.getCurrent() as TrackEditingState).getButtons()[3].action();
        await runUntil(STATE_TRACK_UPLOAD);
        const upload = manager.getCurrent() as TrackUploadState;
        const createElement = document.createElement;
        vi.stubGlobal('document', {
            ...document,
            createElement: (tag: string) =>
                Object.assign(createElement(tag), { toDataURL: () => 'data:image/png;base64,' }),
        });
        const uploaded = async (button: number) => {
            upload.getButtons()[button].action();
            await new Promise((resolve) => setTimeout(resolve, 10));
            const [, request] = fetch.mock.calls.at(-1) as unknown as [string, RequestInit];
            return (request.body as URLSearchParams).get('trackCode') ?? '';
        };

        expect(upload.getButtons().map((button) => button.label)).toEqual([
            'Cancel',
            'Upload track code',
            'Upload editor file',
        ]);
        // Main layers merged into the solid section, the foreground layer into the foreground
        // solid section
        expect(await uploaded(1)).toBe('-50 1i 50 1i,0 a a 0,###0 0 a a,##BMX#0 0');
        expect(TrackFormat.isEditorCode(await uploaded(2))).toBe(true);
        expect(location.href).toBe('?track=9');
    });

    test('show why they cannot be parsed', async () => {
        session.trackCode = '{"format":"openrider-editor","version":1,"layers":[]}';
        manager.push(STATE_TRACK_PARSER);

        expect(frame()).toContain('Error parsing track: "The editor file has no main layer"');
    });
});
