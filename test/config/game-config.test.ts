import { afterEach, describe, expect, test } from 'vitest';
import { GameConfig } from '../../src/openrider/config/game-config';

/** Host element double, with the given data attributes. */
function host(dataset: Record<string, string> = {}): HTMLElement {
    return { dataset } as unknown as HTMLElement;
}

afterEach(() => {
    GameConfig.baseUrl = './';
    GameConfig.trackUrl = '?track={id}';
});

describe('Game configuration', () => {
    test('defaults to the folder of the page', () => {
        GameConfig.configure(host());

        expect(GameConfig.url('.setup/db/trackdata/')).toBe('./.setup/db/trackdata/');
        expect(GameConfig.trackPage(7)).toBe('?track=7');
    });

    test('reads the base and track page URLs of the host element', () => {
        GameConfig.configure(host({ baseUrl: '/openrider', trackUrl: '/tracks/{id}/' }));

        expect(GameConfig.url('media/icon/pause.svg')).toBe('/openrider/media/icon/pause.svg');
        expect(GameConfig.trackPage(7)).toBe('/tracks/7/');
    });

    test('races the track of the host element, else the one of the page URL', () => {
        expect(GameConfig.trackId(host({ trackId: '3' }), '?track=5')).toBe(3);
        expect(GameConfig.trackId(host(), '?track=5')).toBe(5);
        expect(GameConfig.trackId(host(), '')).toBeNull();
        expect(GameConfig.trackId(host({ trackId: 'x' }), '')).toBeNull();
        expect(GameConfig.trackId(host(), '?track=-1')).toBeNull();
    });
});
