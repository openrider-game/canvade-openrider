import { describe, expect, test } from 'vitest';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { parseTrack } from '../helpers/track';

describe('Ghost parser', () => {
    test('reads the toggle times of each control, the time, the bike and the name', () => {
        const ghost = GhostParser.parse('0 120,30 31,,5 6 7,240,600,MTB,Speedy');

        expect(
            Object.fromEntries([...ghost.keys].map(([key, times]) => [key, [...times]])),
        ).toEqual({
            upPressed: [0, 120],
            downPressed: [30, 31],
            leftPressed: [],
            rightPressed: [5, 6, 7],
            turnPressed: [240],
        });
        expect(ghost.time).toBe(600);
        expect(ghost.bike.bikeName).toBe('MTB');
        expect(ghost.name).toBe('Speedy');
    });

    test('falls back to defaults for missing parts', () => {
        const ghost = GhostParser.parse(',,,,,,Unknown');

        expect([...ghost.keys.values()].every((times) => times.size === 0)).toBe(true);
        expect(ghost.time).toBe(0);
        expect(ghost.bike.bikeName).toBe('BMX');
        expect(ghost.name).toBe('Ghost');
    });

    test('generates the ghost string of a run, read back identically', () => {
        const track = parseTrack('-50 1i 2000 1i#####MTB#0 0');
        const keyLog = track.playerRunner.instance?.keyLog;
        keyLog?.get('upPressed')?.push(0, 50);
        keyLog?.get('turnPressed')?.push(20, 21);
        track.playerRunner.time = 75;

        const ghostString = GhostParser.generate(track.playerRunner);
        const ghost = GhostParser.parse(ghostString);

        expect(ghostString).toBe('0 50,,,,20 21,75,MTB');
        expect([...(ghost.keys.get('upPressed') ?? [])]).toEqual([0, 50]);
        expect(ghost.time).toBe(75);
    });

    test('writes the pauses of a run after an empty name, the website naming the ghost', () => {
        const track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
        const runner = track.playerRunner;
        runner.instance?.keyLog.get('upPressed')?.push(0);
        runner.time = 40;
        track.pause(true);
        // Paused again while paused: one pause
        track.pause(true);
        track.pause(false);
        runner.time = 90;
        // A step while paused counts, as does the pause before it
        track.step();
        track.step();
        runner.time = 120;

        const ghostString = GhostParser.generate(runner);
        const ghost = GhostParser.parse(ghostString);

        expect(ghostString).toBe('0,,,,,120,BMX,,40 90 90');
        expect(ghost.name).toBe('Ghost');
        expect(ghost.pauses).toEqual([40, 90, 90]);
        expect(GhostParser.parse(ghostString.replace(',,40', ',Speedy,40')).name).toBe('Speedy');
    });

    test('reads the ghosts recorded before the pauses were, without pauses', () => {
        expect(GhostParser.parse('0 120,,,,,600,MTB,Speedy').pauses).toEqual([]);
        expect(GhostParser.parse('0 120,,,,,600,MTB').pauses).toEqual([]);
    });

    test('keeps the pauses of a checkpoint with it, as its inputs', () => {
        const track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
        const bike = track.playerRunner.instance!;
        bike.pauseLog.push(10);
        const checkpoint = bike.clone();
        bike.pauseLog.push(30);

        expect(checkpoint.pauseLog).toEqual([10]);
        expect(bike.pauseLog).toEqual([10, 30]);
    });
});
