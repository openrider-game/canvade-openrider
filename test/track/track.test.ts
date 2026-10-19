import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import type { Cell } from '../../src/openrider/grid/cell/cell';
import { Grid } from '../../src/openrider/grid/grid';
import { Target } from '../../src/openrider/item/reachable/target';
import { SceneryLine } from '../../src/openrider/item/line/scenery-line';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Track } from '../../src/openrider/track/track';
import { MAX_ZOOM, MIN_ZOOM } from '../../src/openrider/track/track.constants';
import { stubBrowser } from '../helpers/canvas';
import { parseTrack, pressKey, releaseKey, runTicks } from '../helpers/track';

let track: Track;

function addLine(line: SolidLine | SceneryLine, foreground = false): void {
    line.layer = foreground ? track.layers.foreground[0] : track.layers.main[0];
    line.addToTrack();
}

/** Every object stored in the cells of a grid, with duplicates for objects in several cells. */
function cellContent(grid: Grid<Cell>) {
    return [...grid.cells.values()].flatMap((cell) => [
        ...cell.lines,
        ...cell.scenery,
        ...cell.objects,
    ]);
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Track coordinates', () => {
    test('converts between world units and canvas pixels around the camera', () => {
        track.camera.set(new Vector(100, 50));
        track.zoomFactor = 2;

        expect(track.toPixel(new Vector(100, 50))).toEqual(new Vector(350, 200));
        expect(track.toPixel(new Vector(110, 40))).toEqual(new Vector(370, 180));
        expect(track.toWorld(new Vector(370, 180))).toEqual(new Vector(110, 40));
    });

    test('zooms by steps, within bounds, keeping the given point in place', () => {
        track.zoomFactor = 1;
        const point = new Vector(200, 100);
        const before = track.toPixel(point);

        track.zoomAt(point, 1);
        expect(track.zoomFactor).toBe(1.2);
        expect(track.toPixel(point).x).toBeCloseTo(before.x);
        expect(track.toPixel(point).y).toBeCloseTo(before.y);

        for (let i = 0; i < 50; i++) track.zoomAt(point, 1);
        expect(track.zoomFactor).toBe(MAX_ZOOM);
        for (let i = 0; i < 50; i++) track.zoomAt(point, -1);
        expect(track.zoomFactor).toBe(MIN_ZOOM);
    });

    test('snaps the mouse position to the grid', () => {
        track.setMousePosition(new Vector(14.6, -26));
        expect(track.mousePos).toEqual(new Vector(15, -26));

        track.gridDetail = 10;
        track.setMousePosition(new Vector(14.6, -26));
        expect(track.realMousePos).toEqual(new Vector(14.6, -26));
        expect(track.mousePos).toEqual(new Vector(10, -30));
    });

    test('is raced only when it has an id', () => {
        expect(new Track().isRace()).toBe(false);
        expect(new Track(12).isRace()).toBe(true);
    });
});

describe('Track objects storage', () => {
    test('stores a line in every cell it crosses, in both grids of its layer', () => {
        const line = new SolidLine(new Vector(-150, 50), new Vector(250, 50), track);
        addLine(line);

        const physicsCells = [...track.layers.main[0].grid.cells.values()].filter((cell) =>
            cell.lines.includes(line),
        );
        expect(physicsCells.map((cell) => cell.x).sort((a, b) => a - b)).toEqual([
            -200, -100, 0, 100, 200,
        ]);
        expect(
            [...track.layers.main[0].cache.cells.values()].filter((cell) =>
                cell.lines.includes(line),
            ),
        ).toHaveLength(2);
    });

    test('keeps too short lines out of the cells, but in the totals', () => {
        const line = new SolidLine(new Vector(0, 0), new Vector(1, 0), track);
        addLine(line);

        expect(track.layers.main[0].grid.totalSolidLines.has(line.id)).toBe(true);
        expect(cellContent(track.layers.main[0].grid)).not.toContain(line);
    });

    test('removes an object from every cell', () => {
        const line = new SolidLine(new Vector(-150, 50), new Vector(250, 50), track);
        addLine(line);
        line.removeFromTrack();

        expect(cellContent(track.layers.main[0].grid)).not.toContain(line);
        expect(cellContent(track.layers.main[0].cache)).not.toContain(line);
        expect(track.layers.main[0].grid.totalSolidLines.has(line.id)).toBe(false);
    });

    test('erases the objects of the allowed kinds and layers only', () => {
        const solid = new SolidLine(new Vector(-20, 300), new Vector(20, 300), track);
        const scenery = new SceneryLine(new Vector(-20, 300), new Vector(20, 300), track);
        const foreground = new SolidLine(new Vector(-20, 300), new Vector(20, 300), track);
        const target = new Target(new Vector(0, 300), track);
        addLine(solid);
        addLine(scenery);
        addLine(foreground, true);
        target.layer = track.layers.main[0];
        target.addToTrack();
        const eraser = new Vector(0, 300);

        const deleted = track.checkDelete(
            eraser,
            10,
            { solid: false, scenery: true, item: true },
            track.layers.main,
        );

        expect(deleted).toEqual(expect.arrayContaining([scenery, target]));
        expect(deleted).toHaveLength(2);
        expect(solid.onTrack && foreground.onTrack).toBe(true);
    });
});

describe('Track physics', () => {
    test('the bike falls on the ground and rides it', () => {
        runTicks(track, 50);
        const bike = track.playerRunner.instance;
        // Standing on the ground line, at y = 50
        expect(bike?.backWheel.pos.y).toBeCloseTo(50 - (bike?.backWheel.size ?? 0), 0);

        pressKey('up');
        runTicks(track, 100);
        releaseKey('up');

        expect(track.playerRunner.instance?.hitbox.pos.x).toBeGreaterThan(50);
        expect(track.playerRunner.dead).toBe(false);
    });

    test('a bike falling on its head crashes and leaves a ragdoll', () => {
        const flat = parseTrack('-200 0 200 0#####BMX#0 -100');
        flat.playerRunner.instance?.turn();
        // Upside down: the hitbox under the wheels
        const bike = flat.playerRunner.instance;
        if (!bike) throw new Error('No bike');
        bike.hitbox.pos.y += 100;
        bike.hitbox.oldPos.y += 100;

        runTicks(flat, 100);

        expect(flat.playerRunner.dead).toBe(true);
        expect(flat.playerRunner.deadObject?.points).toHaveLength(10);
    });

    test('pausing the track keeps the time, the play states not running the physics', () => {
        track.pause(true);
        expect(track.paused).toBe(true);

        track.restart();
        expect(track.paused).toBe(false);
        expect(track.time).toBe(0);
    });

    test('a ghost replays its inputs', () => {
        const ghost = new GhostRunner(track, '0,,,,,500,MTB,Rider');
        ghost.createBike();
        track.ghostRunners.set(1, ghost);

        runTicks(track, 150);

        expect(ghost.controls.upPressed).toBe(true);
        expect(ghost.instance?.hitbox.pos.x).toBeGreaterThan(50);
        expect(ghost.instance?.color).toBe(ghost.color);
        expect(ghost.color).toMatch(/^#[0-9A-F]{6}$/);
    });

    test('follows the first ghost while the player has no checkpoint', () => {
        const ghost = new GhostRunner(track, ',,,,,500,BMX,Rider');
        ghost.createBike();
        track.ghostRunners.set(1, ghost);

        track.updateFocalPoint();
        expect(track.focalPoint).toBe(ghost.instance?.hitbox);

        track.playerRunner.mustSave = true;
        track.playerRunner.fixedUpdate();
        track.updateFocalPoint();
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });
});
