import { describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { RemoteRunner } from '../../src/openrider/bike/runner/remote-runner';
import { GameConfig } from '../../src/openrider/config/game-config';
import { EnduranceRecords } from '../../src/openrider/endurance/endurance-records';
import { EnduranceRun } from '../../src/openrider/endurance/endurance-run';
import { EnduranceService } from '../../src/openrider/request/endurance-service';
import { MODIFIERS } from '../../src/openrider/item/modifiers';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { pressKey, releaseKey } from '../helpers/track';
import {
    memoryStorage,
    createCourse,
    tickRace,
    rideUntilFall,
    useEnduranceTests,
} from './endurance-helpers';

useEnduranceTests();

describe('Endurance run', () => {
    test('counts the distance, then ends when the rider falls into a gap', () => {
        const course = createCourse(4);
        const records = new EnduranceRecords(memoryStorage());
        const run = new EnduranceRun(course, records);
        const track = course.track;
        const runner = track.playerRunner;

        pressKey('up');
        for (let tick = 0; tick < 100; tick++) {
            tickRace(track);
            run.update();
        }
        releaseKey('up');
        expect(run.over).toBe(false);
        expect(run.distance).toBeGreaterThan(5);
        expect(run.time).toBe(100);

        // Into the void: far under the ground
        const bike = runner.instance;
        if (!bike) throw new Error('No bike');
        bike.points.forEach((point) => point.pos.selfAdd({ x: 0, y: 2000 } as never));
        run.update();

        expect(runner.dead).toBe(true);
        expect(run.result).toEqual({ distance: run.distance, time: 100, seed: 4, version: 1 });
        expect(run.ghostString).toMatch(/,100,BMX$/);
        expect(run.beaten).toEqual({ overall: true, track: true });
        expect(records.best).toEqual(run.result);

        // Restarting starts a new run, on the same track
        track.restart();
        run.update();
        expect(run.over).toBe(false);
        expect(run.distance).toBe(0);
    });

    test('ends when an invincible rider falls into a gap', () => {
        const course = createCourse(4);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        const runner = course.track.playerRunner;
        run.update();

        runner.modifiersMask |= MODIFIERS.INVINCIBILITY;
        runner.instance?.points.forEach((point) => point.pos.selfAdd({ x: 0, y: 2000 } as never));
        run.update();

        expect(run.over).toBe(true);
    });

    test('ends when the bike explodes on a bomb', () => {
        const course = createCourse(4);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        const runner = course.track.playerRunner;
        run.update();

        runner.explode(
            runner.instance?.hitbox.pos.clone() ?? (null as never),
            runner.instance?.hitbox.velocity.clone() ?? (null as never),
        );
        run.update();

        expect(run.over).toBe(true);
    });

    test('plays the same with ghosts racing, whatever they do', () => {
        const ride = (ghostString: string | null) => {
            const course = createCourse(9);
            const track = course.track;
            if (ghostString !== null) {
                const ghost = new GhostRunner(track, ghostString, false);
                ghost.createBike();
                track.ghostRunners.set(1, ghost);
                track.restart();
            }
            const run = rideUntilFall(course);
            return [run.distance, run.time, track.playerRunner.instance?.hitbox.pos.x];
        };

        const alone = ride(null);
        expect(alone[1]).toBeGreaterThan(100);
        // A ghost braking at the start, and one on another bike riding further
        expect(ride('0,0,,,,4000,BMX')).toEqual(alone);
        expect(ride('0,,,,,4000,MTB')).toEqual(alone);
    });

    test('is retired while riding, its ghost and the verifier retiring where it was ridden', () => {
        const course = createCourse(9);
        const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
        pressKey('up');
        for (let tick = 0; tick < 150; tick++) {
            tickRace(course.track);
            run.update();
        }
        releaseKey('up');
        expect(run.over).toBe(false);

        expect(run.retire()).toBe(true);
        expect(run.retire()).toBe(false);
        expect([run.over, run.retired]).toEqual([true, true]);
        expect(run.distance).toBeGreaterThan(5);
        expect(run.result).toMatchObject({ distance: run.distance, time: run.time });
        // The rider falls off, as when crashing
        expect(course.track.playerRunner.dead).toBe(true);

        // The backend replays the run alive until its end, retired there
        const ghostString = run.ghostString ?? '';
        const limits = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };
        expect(GhostVerifier.verifyEndurance(9, 1, ghostString, run.time, limits)).toEqual({
            valid: true,
            reason: '',
            distance: run.distance,
            retired: true,
        });

        // Its ghost retires where it was ridden
        const replay = createCourse(9);
        const ghost = new GhostRunner(replay.track, ghostString, false);
        ghost.createBike();
        replay.track.ghostRunners.set(1, ghost);
        for (let tick = 0; tick < 1000 && !replay.riderOf(ghost)?.over; tick++) {
            tickRace(replay.track);
            replay.step();
        }
        expect(replay.riderOf(ghost)).toMatchObject({
            over: true,
            retired: true,
            distance: run.distance,
            time: run.time,
        });

        // As a rider of a live session, told they retired
        const live = createCourse(9);
        const remote = new RemoteRunner(live.track, 'Rider');
        live.track.remoteRunners.set('rider', remote);
        const { keys } = GhostParser.parse(ghostString);
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            ...[...keys].flatMap(([control, times]) =>
                [...times].map((time) => ({ type: 'toggle' as const, time, control })),
            ),
            { type: 'progress', time: run.time },
            { type: 'retire', time: run.time },
        ]);
        for (let tick = 0; tick < 1000 && !live.riderOf(remote)?.over; tick++) {
            remote.advance();
        }
        expect(live.riderOf(remote)).toMatchObject({
            retired: true,
            distance: run.distance,
            time: run.time,
        });
    });

    test('is replayed by the verifier of the backend from its seed', () => {
        const run = rideUntilFall(createCourse(9));
        const ghostString = run.ghostString ?? '';
        const limits = { maxTicks: 10000, deadline: Number.MAX_SAFE_INTEGER };

        expect(GhostVerifier.verifyEndurance(9, 1, ghostString, run.time, limits)).toEqual({
            valid: true,
            reason: '',
            distance: run.distance,
            retired: false,
        });
        // Another track, or a time claimed apart from the run
        expect(GhostVerifier.verifyEndurance(10, 1, ghostString, run.time, limits).valid).toBe(
            false,
        );
        const forged = ghostString.replace(/,[0-9]+,BMX$/, `,${run.time + 50},BMX`);
        expect(GhostVerifier.verifyEndurance(9, 1, forged, run.time + 50, limits)).toMatchObject({
            valid: false,
            reason: `The rider falls at another time: tick ${run.time}`,
        });
    });

    test('plays the same for the same seed and inputs', () => {
        const ride = () => {
            const course = createCourse(9);
            const run = new EnduranceRun(course, new EnduranceRecords(memoryStorage()));
            const runner = course.track.playerRunner;
            pressKey('up');
            for (let tick = 0; tick < 400 && !run.over; tick++) {
                tickRace(course.track);
                run.update();
            }
            releaseKey('up');
            return [run.distance, run.time, runner.instance?.hitbox.pos.x];
        };

        expect(ride()).toEqual(ride());
    });
});

describe('Endurance records', () => {
    test('keep the furthest run, the fastest one for the same distance', () => {
        const storage = memoryStorage();
        const records = new EnduranceRecords(storage);

        expect(records.submit({ distance: 100.4, time: 900, seed: 1 })).toEqual({
            overall: true,
            track: true,
        });
        // As far in whole meters, but slower: no record
        expect(records.submit({ distance: 100.9, time: 950, seed: 1 }).overall).toBe(false);
        // As far and faster
        expect(records.submit({ distance: 100.2, time: 800, seed: 1 }).overall).toBe(true);
        // Shorter, but on another track: its record only
        expect(records.submit({ distance: 50, time: 400, seed: 2 })).toEqual({
            overall: false,
            track: true,
        });

        const reloaded = new EnduranceRecords(storage);
        expect(reloaded.best).toEqual({ distance: 100.2, time: 800, seed: 1 });
        expect(reloaded.bestOn(2)?.distance).toBe(50);
        expect(reloaded.bestOn(3)).toBeNull();
    });

    test('last until the page is closed without storage', () => {
        const records = new EnduranceRecords(null);
        records.submit({ distance: 10, time: 100, seed: 1 });

        expect(records.best?.distance).toBe(10);
    });
});

describe('Endurance configuration', () => {
    const host = (dataset: Record<string, string> = {}) => ({ dataset }) as unknown as HTMLElement;

    test('reads the mode and the seed of the host element, else of the page URL', () => {
        GameConfig.configure(host(), '');
        expect(GameConfig.mode).toBe('tracks');
        expect(GameConfig.seed).toBeNull();

        GameConfig.configure(host(), '?mode=endurance&seed=1234');
        expect(GameConfig.mode).toBe('endurance');
        expect(GameConfig.seed).toBe(1234);

        GameConfig.configure(host({ gameMode: 'endurance', seed: '77' }), '?seed=1234');
        expect(GameConfig.seed).toBe(77);

        GameConfig.configure(host(), '?mode=endurance&seed=-3');
        expect(GameConfig.seed).toBeNull();
    });
});

describe('Endurance leaderboard', () => {
    /** Response double of the backend. */
    function response(status: number, body: unknown): Response {
        return {
            ok: status < 400,
            status,
            statusText: '',
            json: () => Promise.resolve(body),
        } as Response;
    }

    test('is configured by the host element, on the track of its seed', () => {
        const host = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

        GameConfig.configure(host({ seed: '42', enduranceSave: '1', enduranceBest: '120.5,900' }));
        expect(GameConfig.enduranceSave).toBe(true);
        expect(GameConfig.enduranceBest).toEqual({ distance: 120.5, time: 900 });

        GameConfig.configure(host({ enduranceSave: '1' }));
        expect(GameConfig.enduranceSave).toBe(false);
        expect(GameConfig.enduranceBest).toBeNull();
    });

    test('races the ghosts of the host element from the start, else the ones of the page URL', () => {
        const host = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLElement;

        GameConfig.configure(host({ ghosts: '3,abc,-1,5' }), '?ghosts=8');
        expect(GameConfig.ghostIds).toEqual([3, 5]);
        GameConfig.configure(host({}), '?ghosts=8');
        expect(GameConfig.ghostIds).toEqual([8]);
        GameConfig.configure(host({}));
        expect(GameConfig.ghostIds).toEqual([]);
    });

    test('gets the runs of its track beating the best one uploaded', () => {
        GameConfig.enduranceSave = true;
        GameConfig.seed = 9;
        GameConfig.version = 1;
        GameConfig.enduranceBest = { distance: 50.2, time: 800 };

        expect(EnduranceService.shouldSave({ distance: 51, time: 2000, seed: 9 })).toBe(true);
        expect(EnduranceService.shouldSave({ distance: 50.9, time: 700, seed: 9 })).toBe(true);
        expect(EnduranceService.shouldSave({ distance: 50.9, time: 900, seed: 9 })).toBe(false);
        expect(EnduranceService.shouldSave({ distance: 80, time: 900, seed: 10 })).toBe(false);
        GameConfig.enduranceSave = false;
        expect(EnduranceService.shouldSave({ distance: 80, time: 900, seed: 9 })).toBe(false);
    });

    test('uploads a run once over, telling its rank, or why it was refused', async () => {
        GameConfig.enduranceSave = true;
        GameConfig.seed = 9;
        GameConfig.version = 1;
        const fetch = vi.fn(() => Promise.resolve(response(200, { ID: 7, RANK: 2 })));
        vi.stubGlobal('fetch', fetch);
        const run = rideUntilFall(createCourse(9));

        await EnduranceService.saveRun(run);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        const body = init.body as URLSearchParams;
        expect(url).toBe('./backend/db/enduranceupload/');
        expect(body.get('seed')).toBe('9');
        expect(body.get('ghostString')).toBe(run.ghostString);
        expect(body.get('time')).toBe(String(run.time));
        expect(run.upload).toEqual({ state: 'saved', rank: 2 });
        expect(GameConfig.enduranceBest).toEqual({ distance: run.distance, time: run.time });
        expect(document.dispatchEvent).toHaveBeenCalled();

        fetch.mockImplementation(() =>
            Promise.resolve(response(422, { error: 'The run does not match its track' })),
        );
        await EnduranceService.saveRun(run);
        expect(run.upload).toEqual({
            state: 'refused',
            reason: 'The run does not match its track',
        });
    });
});
