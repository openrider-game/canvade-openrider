import { CONTROL_NAMES, ControlName } from '../bike/runner/runner-controls';
import { MODIFIERS } from '../item/modifiers';
import { WorkerPool } from '../thread/worker-pool';
import type { Track } from './track';

/** Symbols of the pressed controls in the stats. */
const CONTROL_SYMBOLS: Record<ControlName, string> = {
    upPressed: '↑',
    downPressed: '↓',
    leftPressed: '←',
    rightPressed: '→',
    turnPressed: 'turn',
};

/** Names of the status effects in the stats, by flag of {@link MODIFIERS}. */
const MODIFIER_NAMES: Record<keyof typeof MODIFIERS, string> = {
    INVINCIBILITY: 'invincible',
    NO_STEER: 'no steer',
    SLIPPERY: 'slippery',
    ENGINE_OFF: 'engine off',
    ZERO_GRAVITY: 'zero gravity',
};

/**
 * Lines of the stats overlay of the debug mode: frame rate and physics time, view, content of the
 * track, background rendering, then inputs and status effects of the player.
 *
 * @param fps - Frame rate measured by the caller, in frames per second.
 */
export function debugStats(track: Track, fps: number): string[] {
    const layers = track.layers.all;
    const count = (pick: (layer: (typeof layers)[number]) => Map<number, unknown>) =>
        layers.reduce((total, layer) => total + pick(layer).size, 0);
    const runner = track.playerRunner;
    const inputs = CONTROL_NAMES.filter((name) => runner.controls[name]).map(
        (name) => CONTROL_SYMBOLS[name],
    );
    const status = (Object.keys(MODIFIERS) as Array<keyof typeof MODIFIERS>)
        .filter((name) => runner.modifiersMask & MODIFIERS[name])
        .map((name) => MODIFIER_NAMES[name]);
    const round = (value: number) => Math.round(value);

    return [
        `${round(fps)} fps · tick ${track.time}${track.paused ? ' (paused)' : ''}`,
        `zoom ${track.zoomFactor.toFixed(2)} · ` +
            `camera ${round(track.camera.x)} ${round(track.camera.y)}`,
        `mouse ${round(track.realMousePos.x)} ${round(track.realMousePos.y)}`,
        `${layers.length} layers · ${count((layer) => layer.grid.totalSolidLines)} lines · ` +
            `${count((layer) => layer.grid.totalSceneryLines)} scenery · ` +
            `${count((layer) => layer.grid.totalObjects)} items`,
        WorkerPool.supported
            ? `workers: ${WorkerPool.queuedCount} queued, ${WorkerPool.runningCount} rendering`
            : 'workers: unsupported',
        `inputs: ${inputs.join(' ') || '-'}${runner.dead ? ' (dead)' : ''}`,
        `status: ${status.join(', ') || '-'}`,
    ];
}
