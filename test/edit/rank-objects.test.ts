import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { orderOf, rankObject, rankObjects, unitOf } from '../../src/openrider/edit/edit-objects';
import type { TrackObject } from '../../src/openrider/item/track-object';
import type { Track } from '../../src/openrider/track/track';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, seededRandom } from '../helpers/track';

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Lines and items crowded in a few cells, teleporter pairs among the items. */
function crowdedTrack(random: () => number): string {
    const coordinate = () => Math.floor(random() * 120 - 60).toString(32);
    const lines = (count: number) =>
        Array.from({ length: count }, () => Array.from({ length: 4 }, coordinate).join(' ')).join(
            ',',
        );
    const items = Array.from({ length: 40 }, (_, i) =>
        i % 8 === 0
            ? `W ${coordinate()} ${coordinate()} ${coordinate()} ${coordinate()}`
            : `T ${coordinate()} ${coordinate()}`,
    ).join(',');
    return `${lines(300)}#${lines(300)}#${items}#BMX#0 0`;
}

/** The units of a track as the snapshots list them: each group of linked items once. */
function unitsOf(track: Track): TrackObject[] {
    const units = new Set<TrackObject>();
    track.layers.all.forEach((layer) =>
        layer.objects().forEach((object) => units.add(unitOf(object))),
    );
    return [...units];
}

/**
 * Order of the objects in every list of every cell of both grids, and in the totals of the
 * layers, each object by its index in the units of the track before ranking.
 */
function arrangement(track: Track, index: Map<TrackObject, number>): unknown {
    const id = (object: TrackObject) => index.get(unitOf(object)) ?? -1;
    return track.layers.all.map((layer) => ({
        cells: [layer.grid, layer.cache].map((grid) =>
            [...grid.cells.entries()].map(([key, cell]) => [
                key,
                cell.lines.map(id),
                cell.scenery.map(id),
                cell.objects.map(id),
            ]),
        ),
        totals: layer.objects().map(id),
    }));
}

describe('Ranking objects', () => {
    test.each([1, 2, 3, 4, 5])(
        'puts the objects in the same order as ranking them one by one (seed %i)',
        (seed) => {
            const random = seededRandom(seed);
            const code = crowdedTrack(random);
            const tracks = [parseTrack(code), parseTrack(code)];
            const units = tracks.map(unitsOf);
            const indexes = units.map((list) => new Map(list.map((object, i) => [object, i])));

            // Some objects ranked already, as by the live edits: some at the rank of their index
            const ranked = Array.from({ length: 150 }, () => {
                const i = Math.floor(random() * units[0].length);
                const roll = random();
                return [i, roll < 0.3 ? i : Math.floor(roll * 5000)] as const;
            });
            tracks.forEach((_, t) =>
                ranked.forEach(([i, order]) => rankObject(units[t][i], order)),
            );
            expect(arrangement(tracks[1], indexes[1])).toEqual(arrangement(tracks[0], indexes[0]));

            // Ranked whole, as a snapshot does: one by one, then together
            const sorted = units.map((list) =>
                [...list].sort((a, b) => (orderOf(a) ?? -1) - (orderOf(b) ?? -1)),
            );
            sorted[0].forEach((object, order) => rankObject(object, order));
            rankObjects(sorted[1]);

            expect(sorted[1].map((object) => indexes[1].get(object))).toEqual(
                sorted[0].map((object) => indexes[0].get(object)),
            );
            expect(arrangement(tracks[1], indexes[1])).toEqual(arrangement(tracks[0], indexes[0]));
        },
    );
});
