import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GameConfig } from '../../src/openrider/config/game-config';
import { GhostService } from '../../src/openrider/request/ghost-service';
import {
    STATE_TRACK_EDITING,
    STATE_TRACK_FETCHER,
    STATE_TRACK_RACING,
} from '../../src/states/state-names';
import { createCanvasMock } from '../helpers/canvas';
import { RACE_CODE, manager, session, runUntil, useGame } from './game-helpers';

useGame();

describe('Racing a track', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                // The track itself, here of the original format
                const body = url.includes('trackdata')
                    ? RACE_CODE
                    : JSON.stringify({ GHOSTSTRING: '0,,,,,500,MTB,Speedy' });
                return new Response(body, {
                    headers: { 'content-length': String(body.length) },
                });
            }),
        );
    });

    test('downloads the track to race, then races it', async () => {
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);

        expect(session.track.isRace()).toBe(true);
        expect(session.track.targets.size).toBe(1);
        // Only the racing tools are available
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeUndefined();
        expect(session.track.toolCollection.getByToolName('Pause')).toBeDefined();
    });

    test('races the ghosts of a shared link from the start, several of them', async () => {
        GameConfig.ghostIds = [3, 4];
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);
        // The ghosts are downloaded first
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect([...session.track.ghostRunners.keys()].sort()).toEqual([3, 4]);
        expect(GameConfig.ghostIds).toEqual([]);
        const requests = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        expect(requests.filter((url) => url.includes('ghostdata'))).toHaveLength(2);
    });

    test('edits the downloaded track instead when the host element asks for it', async () => {
        GameConfig.editTrack = true;
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_EDITING);

        // The bytes downloaded, here of a track of the original format
        expect(session.trackCode).toEqual(new TextEncoder().encode(RACE_CODE));
        // Edited as a new track: finishing it offers no ghost to save
        expect(session.track.isRace()).toBe(false);
        expect(session.track.targets.size).toBe(1);
        expect(session.track.toolCollection.getByToolName('Eraser')).toBeDefined();
    });

    test('shows the error when the track does not exist', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('false')),
        );
        session.trackId = 404;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_FETCHER);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const { context } = createCanvasMock();

        manager.render(context);

        expect(vi.mocked(context.fillText).mock.calls[0][0]).toBe(
            'Error fetching track: "Track does not exist"',
        );
    });

    test.each([
        [
            'the error of the backend',
            new Response(JSON.stringify({ error: 'Track does not exist' }), { status: 404 }),
            'Track does not exist',
        ],
        [
            'the HTTP status without a JSON error',
            new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }),
            '502 Bad Gateway',
        ],
    ])('shows %s when the request fails', async (_name, response, message) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response),
        );
        session.trackId = 404;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_FETCHER);
        await new Promise((resolve) => setTimeout(resolve, 10));
        const { context } = createCanvasMock();

        manager.render(context);

        expect(vi.mocked(context.fillText).mock.calls[0][0]).toBe(
            `Error fetching track: "${message}"`,
        );
    });

    test('races against the ghosts, sorted by time', async () => {
        session.trackId = 5;
        manager.push(STATE_TRACK_FETCHER);
        await runUntil(STATE_TRACK_RACING);

        await GhostService.toggleGhost(session.track, 3);

        const ghost = session.track.ghostRunners.get(3);
        expect(ghost?.ghostName).toBe('Speedy');
        expect(session.track.focalPoint).toBe(ghost?.instance?.hitbox);
        // Cached: toggling again removes it without downloading it again
        await GhostService.toggleGhost(session.track, 3);
        expect(session.track.ghostRunners.size).toBe(0);
        await GhostService.toggleGhost(session.track, 3);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });
});
