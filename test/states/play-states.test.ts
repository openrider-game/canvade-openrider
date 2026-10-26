import { State, StateClass, StateManager } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameConfig } from '../../src/openrider/config/game-config';
import { Session } from '../../src/states/session';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_GENERATOR,
    STATE_TRACK_PARSER,
    STATE_TRACK_RACING,
    STATE_TRACK_UPLOAD,
} from '../../src/states/state-names';
import States from '../../src/states/states';
import { TrackEditingState } from '../../src/states/track/track-editing.state';
import { TrackUploadState } from '../../src/states/track-upload/track-upload.state';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { pressKey, releaseKey } from '../helpers/track';

// A long flat track, with a target close to the start position
const RACE_CODE = '-50 1i 1k0 1i##T 64 18###BMX#0 0';

let manager: StateManager;
let session: Session;

async function runFrames(frames: number, until?: string): Promise<void> {
    const state = until ? manager.getState(until) : undefined;
    for (let frame = 0; frame < frames && manager.getCurrent() !== state; frame++) {
        manager.fixedUpdate();
        manager.update(0.5, 20);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (state) {
        // Compared by name: a diff of two states would print their whole track
        expect(manager.getCurrent()?.constructor.name).toBe(state.constructor.name);
    }
}

function fetchMock() {
    return vi.fn(async (url: string) => {
        const body = url.includes('trackdata') ? { CODE: RACE_CODE } : { ID: 77 };
        return new Response(JSON.stringify(body));
    });
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
    releaseKey('up');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Play states', () => {
    test('run the physics and make the camera follow the bike', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_EDITING);
        const track = session.track;
        const time = track.time;

        pressKey('up');
        await runFrames(100);

        expect(track.time).toBe(time + 100);
        expect(track.playerRunner.instance?.hitbox.pos.x).toBeGreaterThan(20);
        // The camera moves towards the followed bike
        expect(track.camera.x).toBeGreaterThan(5);
    });

    test('stop the physics while paused', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_EDITING);
        const track = session.track;
        track.pause(true);
        const time = track.time;

        await runFrames(10);

        expect(track.time).toBe(time);
    });

    test('offer to save the ghost once the race is finished', async () => {
        const fetch = fetchMock();
        vi.stubGlobal('fetch', fetch);
        const confirm = vi.fn(() => true);
        vi.stubGlobal('confirm', confirm);
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_RACING);

        pressKey('up');
        for (let frame = 0; frame < 300 && !confirm.mock.calls.length; frame++) {
            await runFrames(1);
        }

        expect(confirm).toHaveBeenCalledOnce();
        await new Promise((resolve) => setTimeout(resolve, 10));
        const [url, request] = fetch.mock.calls[1] as unknown as [string, RequestInit];
        expect(url).toContain('ghostupload');
        const params = request.body as URLSearchParams;
        expect(params.get('trackId')).toBe('5');
        expect(params.get('ghostString')).toMatch(/^0( \d+)*,/);
        expect(log).toHaveBeenCalledWith('Ghost saved: 77');
    });
});

describe('Upload state', () => {
    test('generates the track code, then frames the thumbnail', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);

        (manager.getCurrent() as TrackEditingState).getButtons()[3].action();
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_GENERATOR)).toBe(true);
        await runFrames(400, STATE_TRACK_UPLOAD);

        expect(session.trackCode).toBe('-18 1i 18 1i,#####BMX#0 0');
        expect(session.track.paused).toBe(true);
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeUndefined();

        const { context } = createCanvasMock();
        manager.render(context);
        expect(vi.mocked(context.strokeRect)).toHaveBeenCalledWith(225, 125, 250, 150);
    });

    test('uploads the track with its thumbnail', async () => {
        const fetch = fetchMock();
        vi.stubGlobal('fetch', fetch);
        vi.stubGlobal('location', { href: '' });
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        (manager.getCurrent() as TrackEditingState).getButtons()[3].action();
        await runFrames(400, STATE_TRACK_UPLOAD);
        const toDataURL = vi.fn(() => 'data:image/png;base64,THUMBNAIL');
        const createElement = document.createElement;
        vi.stubGlobal('document', {
            ...document,
            createElement: (tag: string) => Object.assign(createElement(tag), { toDataURL }),
        });

        (manager.getCurrent() as TrackUploadState).getButtons()[1].action();
        await new Promise((resolve) => setTimeout(resolve, 10));

        const params = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
            .body as URLSearchParams;
        expect(params.get('trackCode')).toBe('-18 1i 18 1i,#####BMX#0 0');
        expect(params.get('thumbnail')).toBe('THUMBNAIL');
        expect(location.href).toBe('?track=77');
    });

    test('uploads to the backend and opens the track page configured by the host', async () => {
        GameConfig.configure({
            dataset: { baseUrl: '/', trackUrl: '/tracks/{id}/' },
        } as unknown as HTMLElement);
        try {
            const fetch = fetchMock();
            vi.stubGlobal('fetch', fetch);
            vi.stubGlobal('location', { href: '' });
            manager.push(STATE_TRACK_FETCHER);
            await runFrames(400, STATE_TRACK_EDITING);
            manager.render(createCanvasMock().context);
            (manager.getCurrent() as TrackEditingState).getButtons()[3].action();
            await runFrames(400, STATE_TRACK_UPLOAD);
            const toDataURL = vi.fn(() => 'data:image/png;base64,THUMBNAIL');
            const createElement = document.createElement;
            vi.stubGlobal('document', {
                ...document,
                createElement: (tag: string) => Object.assign(createElement(tag), { toDataURL }),
            });

            (manager.getCurrent() as TrackUploadState).getButtons()[1].action();
            await new Promise((resolve) => setTimeout(resolve, 10));

            const [url] = fetch.mock.calls.at(-1) as unknown as [string];
            expect(url).toBe('/backend/db/trackupload/');
            expect(location.href).toBe('/tracks/77/');
        } finally {
            GameConfig.baseUrl = './';
            GameConfig.trackUrl = '?track={id}';
        }
    });

    test('goes back to the editing state when cancelled', async () => {
        manager.push(STATE_TRACK_FETCHER);
        await runFrames(400, STATE_TRACK_EDITING);
        manager.render(createCanvasMock().context);
        (manager.getCurrent() as TrackEditingState).getButtons()[3].action();
        await runFrames(400, STATE_TRACK_UPLOAD);

        (manager.getCurrent() as TrackUploadState).getButtons()[0].action();

        expect(manager.getCurrent() === manager.getState(STATE_TRACK_EDITING)).toBe(true);
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeDefined();
    });
});

describe('Loading states', () => {
    test('display their progress', async () => {
        session.trackCode = RACE_CODE;
        manager.push(STATE_TRACK_FETCHER);
        manager.update(0.5, 20);
        expect(manager.getCurrent() === manager.getState(STATE_TRACK_PARSER)).toBe(true);

        const { context } = createCanvasMock();
        manager.render(context);
        manager.update(0.5, 20);
        manager.render(context);

        const texts = vi.mocked(context.fillText).mock.calls.map(([text]) => text);
        expect(texts[0]).toBe('Parsing Solid lines (Main): 0 %');
        expect(texts[1]).toMatch(/^Parsing Solid lines \(Main\): \d+ %$/);
        // The progress bar never exceeds the bar width, past the background filling each frame
        const bars = vi
            .mocked(context.fillRect)
            .mock.calls.filter(([x, y]) => x !== 0 || y !== 0)
            .map(([, , width]) => width);
        expect(Math.max(...bars)).toBeLessThanOrEqual(500);
    });
});
