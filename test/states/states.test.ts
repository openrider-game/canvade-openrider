import { Display, EventFactory, Keyboard, Vector } from 'canvade';
import { describe, expect, test, vi } from 'vitest';
import { TRACK_DEFAULT, TRACK_MODE_RACING } from '../../src/openrider/track/track.constants';
import { Session } from '../../src/states/session';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_GENERATOR,
    STATE_TRACK_PARSER,
} from '../../src/states/state-names';
import { TrackFormat } from '../../src/openrider/parser/track-format';
import { DrawingLines } from '../../src/openrider/tool/line/drawing-lines';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { TrackEditingState } from '../../src/states/track/track-editing.state';
import { ToolIcons } from '../../src/states/track/ui/tool-icons';
import { createCanvasMock } from '../helpers/canvas';
import { keyEvent } from '../helpers/track';
import { RACE_CODE, manager, session, runUntil, mouseEvent, useGame } from './game-helpers';

useGame();

describe('Session', () => {
    test('gives typed access to the shared data, with defaults', () => {
        expect(session.trackId).toBeNull();
        expect(session.trackCode).toBeNull();
        expect(session.trackUpload).toBe(false);
        expect(session.hasTrack()).toBe(false);
        expect(() => session.track).toThrow('No track has been parsed yet');

        session.trackId = 12;
        session.trackMode = TRACK_MODE_RACING;
        expect(new Session(manager.shared).trackId).toBe(12);
        expect(new Session(manager.shared).trackMode).toBe(TRACK_MODE_RACING);
    });
});

describe('Editing a track', () => {
    test('loads the default track, then edits it', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        expect(session.trackCode).toBe(TRACK_DEFAULT);
        expect(session.track.isRace()).toBe(false);
        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Camera');
        // The editing tools are available
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeDefined();
        expect(manager.getCurrent()?.getWorld() === session.track).toBe(true);
    });

    test('renders the track, the HUD and the interface', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const { context, calls } = createCanvasMock();

        manager.render(context);

        expect(session.track.canvas).toBe(context.canvas);
        // The frame starts by filling the canvas with the background color
        expect(calls.indexOf('fillRect')).toBeLessThan(calls.indexOf('stroke'));
        // HUD time and interface buttons texts
        expect(vi.mocked(context.fillText).mock.calls.map(([text]) => text)).toEqual(
            expect.arrayContaining(['00:00.0', 'Import', 'Export code', 'Export editor', 'Upload']),
        );
    });

    test('selects the tools with their keyboard shortcuts', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        Keyboard.onKeyDown(keyEvent('KeyQ', 'q'));
        manager.getCurrent()?.dispatch(
            'keyboardDown',
            EventFactory.createGameEvent({
                name: 'keyboardDown',
                consumed: false,
                keyboardEvent: {} as KeyboardEvent,
                key: 'Line',
            }),
        );
        Keyboard.onKeyUp(keyEvent('KeyQ', 'q'));

        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Line');
    });

    test('draws with the mouse, the interface keeping the mouse positions in sync', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Line')?.run();
        const lines = session.track.layers.main[0].grid.totalSolidLines;
        const before = lines.size;

        state?.dispatch('pointerDown', mouseEvent('pointerDown', 300, 200));
        state?.dispatch('pointerMove', mouseEvent('pointerMove', 400, 250));
        state?.dispatch('pointerUp', mouseEvent('pointerUp', 400, 250));

        expect(lines.size).toBe(before + 1);
        const line = [...lines.values()].pop();
        expect(line?.pos).toEqual(new Vector(300, 200));
        expect(line?.endPos).toEqual(new Vector(400, 250));
        expect(session.track.uiHovered).toBe(false);
    });

    test('draws with the primary pointer only, not with a finger that is not', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Line')?.run();
        const lines = session.track.layers.main[0].grid.totalSolidLines;
        const before = lines.size;
        /** A finger joining another one, e.g. to pinch. */
        const secondFinger = (name: string, x: number, y: number) => {
            const event = mouseEvent(name, x, y);
            event.detail.pointerEvent = {
                pointerId: 9,
                pointerType: 'touch',
                button: 0,
            } as PointerEvent;
            event.detail.primary = false;
            return event;
        };

        state?.dispatch('pointerDown', secondFinger('pointerDown', 300, 200));
        state?.dispatch('pointerMove', secondFinger('pointerMove', 400, 250));
        state?.dispatch('pointerUp', secondFinger('pointerUp', 400, 250));

        expect(lines.size).toBe(before);
        expect(session.track.toolManager.tool?.mouseDown).toBe(false);
    });

    test('shows the colors of the scenery as swatches in the drawer, picked with a click', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const state = manager.getCurrent();
        session.track.toolCollection.getByToolName('Line')?.run();
        DrawingLines.setScenery(true);
        session.track.invalidateUI();
        const frames = (count: number) => {
            const { context } = createCanvasMock();
            for (let frame = 0; frame < count; frame++) {
                manager.update(0.5, 20);
                manager.render(context);
            }
            return context;
        };
        const click = (x: number, y: number) => {
            state?.dispatch('pointerDown', mouseEvent('pointerDown', x, y));
            state?.dispatch('pointerUp', mouseEvent('pointerUp', x, y));
        };
        try {
            frames(1);
            click(350, 10);
            const context = frames(15);
            // The grey swatch selected, every color filled in
            const texts = vi.mocked(context.fillText).mock.calls.map(([text]) => text);
            expect(texts).toContain('✓');

            // In a panel of 230 pixels centered on the canvas of 700 pixels, inside a padding of
            // 4 pixels: the kind of lines, then two rows of 8 swatches 27.75 pixels wide
            click(239 + 2.5 * 27.75, 4 + 2 * 22 + 11);
            expect(DrawingLines.color).toBe(10);
            click(239 + 0.5 * 27.75, 4 + 22 + 11);
            expect(DrawingLines.color).toBe(0);
        } finally {
            DrawingLines.setScenery(false);
            DrawingLines.setColor(0);
        }
    });

    test('keeps the tool options in a drawer, opened and closed with its handle', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const state = manager.getCurrent();
        const tool = session.track.toolCollection.getByToolName('Eraser') as EraserTool;
        tool.run();
        const frames = (count: number) => {
            const { context } = createCanvasMock();
            for (let frame = 0; frame < count; frame++) {
                manager.update(0.5, 20);
                manager.render(context);
            }
            return vi.mocked(context.fillText).mock.calls.map(([text]) => text);
        };
        // The size of the eraser in the first row, the layers erased in the second one
        const sizeOption = () => tool.getOptions()[0].label;
        const layerOption = () => tool.getOptions()[1].label;
        const click = (x: number, y: number) => {
            state?.dispatch('pointerDown', mouseEvent('pointerDown', x, y));
            state?.dispatch('pointerUp', mouseEvent('pointerUp', x, y));
        };

        // Closed: only the handle is reachable, at the top of the canvas
        expect(frames(1)).toContain('Options ▼');
        click(250, 37);
        expect(layerOption()).toBe('Layers: active');

        click(350, 10);
        // Sliding down, the options being still out of reach after one frame
        frames(1);
        click(250, 37);
        expect(layerOption()).toBe('Layers: active');
        expect(frames(15)).toContain('Options ▲');
        click(250, 37);
        expect(layerOption()).toBe('Layers: all visible');

        // The size stepped up then down with the + and − buttons at the ends of its row, in a
        // panel of 230 pixels centered on the canvas of 700 pixels
        expect(frames(1)).toEqual(expect.arrayContaining(['−', 'Size: 15', '+']));
        click(445, 15);
        expect(sizeOption()).toBe('Size: 20');
        click(250, 15);
        click(250, 15);
        expect(sizeOption()).toBe('Size: 10');

        // Stays open when the options are rebuilt, then closes from the handle under them: a panel
        // of five rows of 22 pixels, inside a padding of 4 pixels
        expect(frames(1)).toContain('Layers: all visible');
        click(350, 2 * 4 + 5 * 22 + 10);
        frames(15);
        click(250, 37);
        expect(layerOption()).toBe('Layers: all visible');
    });

    test('keeps the interface size on high density screens', async () => {
        Display.pixelRatio = 2;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const { context } = createCanvasMock(1400, 800);

        manager.render(context);

        expect(vi.mocked(context.scale)).toHaveBeenCalledWith(2, 2);
        // The HUD is drawn in UI pixels, the canvas being 700 UI pixels wide
        expect(vi.mocked(context.fillText)).toHaveBeenCalledWith('00:00.0', 30, 15);
        // The icons are rasterized in canvas pixels, to stay sharp
        expect(ToolIcons.get('pause').width).toBe(48);

        // Third button of the right toolbar, the eraser, 26 UI pixels wide, in canvas pixels
        const state = manager.getCurrent();
        state?.dispatch(
            'pointerDown',
            mouseEvent('pointerDown', 2 * (700 - 13), 2 * (2 * 26 + 13)),
        );
        state?.dispatch('pointerUp', mouseEvent('pointerUp', 2 * (700 - 13), 2 * (2 * 26 + 13)));
        expect(session.track.toolManager.tool?.toolClass.toolName).toBe('Eraser');
    });

    test('exports the track code as a file', async () => {
        const createObjectURL = vi.fn((blob: Blob) => blob && 'blob:track');
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const editing = manager.getCurrent() as TrackEditingState;

        editing.getButtons()[1].action();
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_GENERATOR)).toBe(true);
        await runUntil(STATE_TRACK_EDITING);

        const [blob] = createObjectURL.mock.calls[0];
        const document = TrackFormat.read(new Uint8Array(await blob.arrayBuffer()));
        expect(document.layers[0].solid).toEqual([[-40, 50, 40, 50]]);
        expect(document.bike).toBe('BMX');
    });

    test('imports a track by parsing the new track code again', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        const previous = session.track;

        // What the import button does once the file is read
        session.trackCode = RACE_CODE;
        manager.pop();
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_PARSER)).toBe(true);
        await runUntil(STATE_TRACK_EDITING);

        expect(session.track).not.toBe(previous);
        expect(session.track.targets.size).toBe(1);
    });

    test('pauses the race when the page is hidden', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);
        vi.stubGlobal('document', { hidden: true });

        manager.getCurrent()?.dispatch('visibilityChange');

        expect(session.track.paused).toBe(true);
    });
});
