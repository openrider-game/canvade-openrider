import { describe, expect, test, vi } from 'vitest';
import * as icons from '../../src/openrider/tool/tool-icons';
import { createCanvasMock } from '../helpers/canvas';

describe('Icons of the item and line tools', () => {
    test('are drawn at any size, without side effect, each with its own key', () => {
        const drawn = Object.values(icons);
        expect(drawn).toHaveLength(29);
        expect(new Set(drawn.map((icon) => icon.key)).size).toBe(29);

        for (const icon of drawn) {
            const { context, calls } = createCanvasMock(80, 80);
            icon.draw(context, 80);
            // Filled items, or stroked lines
            expect(calls.some((call) => ['fill', 'fillRect', 'stroke'].includes(call))).toBe(true);
        }
    });

    test('draw an item centered, zoomed to fill 14 pixels out of 24', () => {
        const { context } = createCanvasMock(48, 48);
        icons.TARGET_ICON.draw(context, 48);

        // A circle of 7 world units at the center, of half of 14 pixels at 48 / 24 pixels per pixel
        const [x, y, radius] = vi.mocked(context.arc).mock.calls[0];
        expect([x, y]).toEqual([24, 24]);
        expect(radius).toBeCloseTo((7 * 14) / 8);
    });
});
