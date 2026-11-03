import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    CellImages,
    CellImageSource,
    DISPLAYED_IMAGE_MS,
} from '../../src/openrider/grid/cell/cell-images';

let now: number;
const cells: CellImages[] = [];

beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
    cells.splice(0).forEach((cell) => cell.clear());
    vi.restoreAllMocks();
});

/** Images of a new cell, freed after the test. */
function cell(): CellImages {
    const images = new CellImages();
    cells.push(images);
    return images;
}

/** Source of 100 bytes per side unit squared: `side` x 25 pixels of 4 bytes. */
const source = (side: number) => ({ width: side, height: 25 }) as unknown as CellImageSource;

describe('Images of the cells', () => {
    test('count the memory of every cell, freed with their images', () => {
        const [a, b] = [cell(), cell()];
        a.put(1, 0, source(10));
        b.put(1, 0, source(20));
        a.put(2, 0, source(10));
        expect(CellImages.totalBytes).toBe(4000);

        // Replaced at the same zoom
        a.put(2, 1, source(30));
        expect(CellImages.totalBytes).toBe(6000);
        a.clear();
        expect(CellImages.totalBytes).toBe(2000);
    });

    test('drop the least recently displayed images past the memory bound, the fallbacks last', () => {
        const [a, b] = [cell(), cell()];
        a.put(1, 0, source(10));
        a.put(2, 0, source(10));
        now = 10;
        b.put(1, 0, source(10));
        b.put(4, 0, source(10));
        // Displayed long after: the images of the first cell are the least recently displayed
        now = 5000;
        b.used(b.get(4)!);

        CellImages.enforceBudget(3000);

        // The image of the first cell above its fallback first, then its fallback
        expect([a.get(1), a.get(2), b.get(1), b.get(4)].map(Boolean)).toEqual([
            true,
            false,
            true,
            true,
        ]);
        CellImages.enforceBudget(2000);
        expect([a.get(1), b.get(1), b.get(4)].map(Boolean)).toEqual([false, true, true]);
    });

    test('keep the images of the cells displayed a moment ago, even past the bound', () => {
        const [a, b] = [cell(), cell()];
        a.put(1, 0, source(10));
        a.put(2, 0, source(10));
        b.put(1, 0, source(10));
        now = DISPLAYED_IMAGE_MS + 100;
        a.used(a.get(2)!);

        CellImages.enforceBudget(0);

        // Every image of the cell displayed kept, those rendered ahead for the zooms around too
        expect([a.get(1), a.get(2), b.get(1)].map(Boolean)).toEqual([true, true, false]);
    });

    test('tell each image dropped, e.g. for the cell to forget its patched copy', () => {
        const dropped: number[] = [];
        const images = new CellImages((zoom) => dropped.push(zoom));
        cells.push(images);
        images.put(1, 0, source(10));
        images.put(2, 0, source(10));

        // Replaced at its zoom, then the cell dropped past the memory bound, its fallback last
        images.put(2, 1, source(10));
        expect(dropped).toEqual([2]);
        now = 10 * DISPLAYED_IMAGE_MS;
        CellImages.enforceBudget(0);
        expect(dropped).toEqual([2, 2, 1]);
    });
});
