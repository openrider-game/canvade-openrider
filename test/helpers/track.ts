import { Keyboard, Vector } from 'canvade';
import { TrackParser } from '../../src/openrider/parser/track-parser';
import { Track } from '../../src/openrider/track/track';
import { createCanvasMock } from './canvas';

/** Physical key codes of the player controls. */
export const PLAYER_KEYS = {
    up: { code: 'ArrowUp', key: 'ArrowUp' },
    down: { code: 'ArrowDown', key: 'ArrowDown' },
    left: { code: 'ArrowLeft', key: 'ArrowLeft' },
    right: { code: 'ArrowRight', key: 'ArrowRight' },
    turn: { code: 'KeyZ', key: 'z' },
} as const;

export type PlayerKey = keyof typeof PLAYER_KEYS;

/**
 * Parses a track code completely, the track being displayed on a 700x400 canvas.
 *
 * The tracks of the tests have no dense cell, so the parser never needs the render workers.
 */
export function parseTrack(code: string, id: number | null = null): Track {
    const track = new Track(id);
    const parser = new TrackParser(track);
    parser.init(code);

    for (let step = 0; !parser.done; step++) {
        if (step > 10000) {
            throw new Error('The track parser does not finish');
        }
        parser.currentStep();
        parser.updateIndicators();
    }

    track.canvas = createCanvasMock().canvas;
    return track;
}

/** Keyboard event double, matching the canvade keyboard expectations. */
export function keyEvent(
    code: string,
    key: string,
    modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey'>> = {},
): KeyboardEvent {
    return {
        code,
        key,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: () => {},
        ...modifiers,
    } as KeyboardEvent;
}

export function pressKey(name: PlayerKey): void {
    Keyboard.onKeyDown(keyEvent(PLAYER_KEYS[name].code, PLAYER_KEYS[name].key));
}

export function releaseKey(name: PlayerKey): void {
    Keyboard.onKeyUp(keyEvent(PLAYER_KEYS[name].code, PLAYER_KEYS[name].key));
}

/** Runs physics ticks like the play states: player first, then the ghosts still racing. */
export function runTicks(track: Track, ticks: number, beforeTick?: (time: number) => void): void {
    for (let i = 0; i < ticks; i++) {
        beforeTick?.(track.time);
        track.playerRunner.fixedUpdate();
        track.ghostRunners.forEach((runner) => {
            if (!runner.done) {
                runner.fixedUpdate();
            }
        });
        track.time++;
    }
}

/** Moves the track mouse to a world position, as the interface layer does on mouse events. */
export function moveMouse(track: Track, x: number, y: number): void {
    track.setMousePosition(new Vector(x, y));
}

/** Mouse event double with the given button (0: left, 2: right). */
export function mouseEvent(button = 0): MouseEvent {
    return { button } as MouseEvent;
}

/** Seeded `Math.random` replacement, so that the random parts of the physics are reproducible. */
export function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}
