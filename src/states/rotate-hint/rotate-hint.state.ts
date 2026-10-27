import { Layer } from 'canvade';
import { firstStateName } from '../first-state';
import { OpenRiderState } from '../openrider.state';
import { RotateHintLayer } from './layers/rotate-hint.layer';

/** Whether a media query matches, false without `matchMedia`, e.g. in the tests. */
function matches(query: string): boolean {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
}

/**
 * State asking to turn the device sideways, before the game loads anything, on touch screens held
 * upright: the game is designed for screens held sideways, and is not played upright. It goes on
 * to the first state of the game (see `firstStateName`) once the device is turned.
 *
 * `main.ts` pushes it in place of the first state when it is needed, see
 * {@link RotateHintState.isNeeded}.
 */
export class RotateHintState extends OpenRiderState {
    private done = false;

    /** Whether the hint shows: a touch screen held upright. */
    public static isNeeded(): boolean {
        return matches('(pointer: coarse) and (orientation: portrait)');
    }

    protected initState(): void {
        this.subscribe('enter', () => (this.layers.get('main') as RotateHintLayer).build());
        this.subscribe('update', this.checkOrientation);
    }

    protected initLayers(): Map<string, Layer> {
        return new Map<string, Layer>([['main', new RotateHintLayer()]]);
    }

    /** Goes on once the device is turned sideways. */
    private checkOrientation(): void {
        if (this.done || matches('(orientation: portrait)')) {
            return;
        }
        this.done = true;
        this.manager.push(firstStateName());
    }
}
