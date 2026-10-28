import { parseItem } from '../../src/openrider/parser/track-document';
import { Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import {
    CommandBlock,
    CommandSettings,
    defaultCommandSettings,
} from '../../src/openrider/item/command/command-block';
import { ITEM_MAP } from '../../src/openrider/item/item.constants';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Bomb } from '../../src/openrider/item/misc/bomb';
import type { TrackObject } from '../../src/openrider/item/track-object';
import { GhostParser } from '../../src/openrider/parser/ghost-parser';
import { CommandBlockTool } from '../../src/openrider/tool/item/command-block.tool';
import { Track } from '../../src/openrider/track/track';
import { GhostVerifier } from '../../src/verify/ghost-verifier';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import {
    mouseEvent,
    moveMouse,
    parseTrack,
    pressKey,
    releaseKey,
    runTicks,
} from '../helpers/track';

let track: Track;

function place<T extends TrackObject>(object: T): T {
    object.layer = track.layers.main[0];
    object.addToTrack();
    return object;
}

/** A command block at a position, on the main layer. */
function block(x: number, y: number, settings: Partial<CommandSettings>): CommandBlock {
    const command = new CommandBlock(
        new Vector(x, y),
        { ...defaultCommandSettings(settings.kind), ...settings },
        track,
    );
    return place(command);
}

/** A vertical wall, from y -100 to 50, at a position. */
function wall(x: number): SolidLine {
    return place(new SolidLine(new Vector(x, -100), new Vector(x, 50), track));
}

/** Area around the wall at x 300. */
const WALL_AREA = { left: 280, top: -120, right: 320, bottom: 60 };

/** A ghost runner with its bike, not racing. */
function ghost(): GhostRunner {
    const runner = new GhostRunner(track, ',,,,,100,BMX,Ghost');
    runner.createBike();
    return runner;
}

/** Whether a line pushes a wheel of a runner placed on it, after the bindings are computed. */
function collides(
    line: SolidLine,
    runner: { instance: { backWheel: { pos: Vector; velocity: Vector } } | null },
    at: Vector,
): boolean {
    track.commands.refresh();
    const wheel = runner.instance?.backWheel;
    if (!wheel) throw new Error('No bike');
    wheel.pos.set(at);
    wheel.velocity.set(new Vector(5, 0));
    line.touched = false;
    line.touch(wheel as never);
    return wheel.pos.x !== at.x || wheel.pos.y !== at.y;
}

/** Touches a block with the back wheel of a runner, placed on it. */
function trigger(
    command: CommandBlock,
    runner: { instance: { backWheel: { pos: Vector } } | null },
): void {
    const wheel = runner.instance?.backWheel;
    if (!wheel) throw new Error('No bike');
    wheel.pos.set(command.pos);
    command.touch(wheel as never);
}

beforeEach(() => {
    stubBrowser();
    track = parseTrack('-50 1i 2000 1i#####BMX#0 0');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Command blocks', () => {
    test('are written to and read from track codes, for each command', () => {
        const settings: Array<Partial<CommandSettings>> = [
            { kind: 'zoom', zoom: 1.5 },
            { kind: 'camera', target: new Vector(640, -96), duration: 100 },
            { kind: 'hide', area: WALL_AREA },
            { kind: 'show', area: WALL_AREA },
            { kind: 'move', area: WALL_AREA, offset: new Vector(0, -128), duration: 75 },
        ];

        for (const setting of settings) {
            const code = block(160, 32, setting).toString();
            expect(code.startsWith('A 50 10 ')).toBe(true);
            const parsed = ITEM_MAP.get('A')?.createInstance(
                parseItem(code)?.values ?? [],
                track,
            ) as CommandBlock;
            expect(parsed.settings).toMatchObject(setting);
            expect(parsed.toString()).toBe(code);
        }
    });

    test('open a door for the bikes that touched them only', () => {
        const door = wall(300);
        const command = block(150, 40, { kind: 'hide', area: WALL_AREA });
        const player = track.playerRunner;
        const other = ghost();
        const onWall = new Vector(295, 0);

        expect(collides(door, player, onWall)).toBe(true);
        trigger(command, player);

        // Touched by the player: open for it, still closed for the ghost
        expect(collides(door, player, onWall)).toBe(false);
        expect(collides(door, other, onWall)).toBe(true);
    });

    test('show a bridge to the bikes that touched them', () => {
        const bridge = wall(300);
        const command = block(150, 40, { kind: 'show', area: WALL_AREA });
        const onBridge = new Vector(295, 0);

        expect(collides(bridge, track.playerRunner, onBridge)).toBe(false);
        trigger(command, track.playerRunner);
        expect(collides(bridge, track.playerRunner, onBridge)).toBe(true);
    });

    test('move the objects of their area over their duration, colliding on their way', () => {
        const door = wall(300);
        const command = block(150, 40, {
            kind: 'move',
            area: WALL_AREA,
            offset: new Vector(0, -300),
            duration: 50,
        });
        const player = track.playerRunner;
        trigger(command, player);

        track.playerRunner.time += 25;
        expect(command.offsetFor(player)?.y).toBeCloseTo(-150);
        track.playerRunner.time += 50;
        expect(command.offsetFor(player)?.y).toBe(-300);

        // Moved up by 300: the bottom of the wall is now at y -250, far from its own cells
        expect(collides(door, player, new Vector(295, -300))).toBe(true);
        expect(collides(door, player, new Vector(295, 0))).toBe(false);
        // Found by the collisions of the track around its new position
        const wheel = player.instance?.backWheel;
        if (!wheel) throw new Error('No bike');
        wheel.pos.set(new Vector(295, -300));
        wheel.velocity.set(new Vector(5, 0));
        track.touch(wheel);
        expect(wheel.pos.x).not.toBe(295);
    });

    test('act on the items of their area too, and keep their state in the checkpoints', () => {
        const bomb = place(new Bomb(new Vector(300, 40), track));
        const command = block(150, 40, { kind: 'hide', area: WALL_AREA });
        const player = track.playerRunner;
        track.commands.refresh();
        expect(bomb.command).toBe(command);

        trigger(command, player);
        player.mustSave = true;
        player.fixedUpdate();
        track.restart();
        // Restarted from the checkpoint: the bomb is still gone for the player
        expect(command.offsetFor(player)).toBeNull();

        player.reset();
        track.restart();
        expect(command.offsetFor(player)).not.toBeNull();
    });

    test('bind the objects added to their area later, and free them once removed', () => {
        const command = block(150, 40, { kind: 'hide', area: WALL_AREA });
        const door = wall(300);
        const outside = wall(500);
        track.commands.refresh();

        expect(door.command).toBe(command);
        expect(outside.command).toBeNull();
        // Drawn on every frame out of the cached images
        const cachedLines = () =>
            [...track.layers.main[0].cache.cells.values()].flatMap((cell) => cell.lines);
        expect(cachedLines()).not.toContain(door);

        command.removeFromTrack();
        track.commands.refresh();
        expect(door.command).toBeNull();
        expect(cachedLines()).toContain(door);
    });

    test('control the view of the player, never for the ghosts', () => {
        const zoom = block(150, 40, { kind: 'zoom', zoom: 2 });
        const camera = block(200, 40, {
            kind: 'camera',
            target: new Vector(800, 0),
            duration: 100,
        });

        trigger(zoom, ghost());
        expect(track.zoomTarget).toBeNull();

        trigger(zoom, track.playerRunner);
        trigger(camera, track.playerRunner);
        expect(track.zoomTarget).toBe(2);
        expect(track.cameraHold?.pos).toEqual(new Vector(800, 0));
        expect(track.cameraHold?.until).toBe(track.time + 100);

        // Taken back by the player, or by restarting
        track.zoomAt(new Vector(), 1);
        track.restart();
        expect(track.zoomTarget).toBeNull();
        expect(track.cameraHold).toBeNull();
    });

    test('open the way for a run, replayed the same by its ghost', () => {
        // A wall the bike crashes into, unless the block on the ground opens it first
        const code = '-50 1i ve 1i,9c -34 9c 1i##A 4m 18 2 8o -3o a0 1s,T fk 18###BMX#0 0';
        const blocked = '-50 1i ve 1i,9c -34 9c 1i##T fk 18###BMX#0 0';
        const ride = (trackCode: string) => {
            track = parseTrack(trackCode, 1);
            const runner = track.playerRunner;
            let ghostString: string | null = null;
            pressKey('up');
            runTicks(track, 600, () => {
                if (runner.done && ghostString === null) {
                    ghostString = GhostParser.generate(runner);
                }
            });
            releaseKey('up');
            return ghostString as string | null;
        };

        expect(ride(blocked)).toBeNull();
        const ghostString = ride(code);
        expect(ghostString).not.toBeNull();
        const time = GhostParser.parse(ghostString ?? '').time;
        expect(
            GhostVerifier.verify(code, ghostString ?? '', time, {
                maxTicks: 1000,
                deadline: Infinity,
            }),
        ).toEqual({
            valid: true,
            reason: '',
        });
    });
});

describe('Command block tool', () => {
    function select(): CommandBlockTool {
        const tool = new CommandBlockTool(track);
        track.toolCollection.add(tool);
        track.toolManager.setTool(tool);
        return tool;
    }

    function click(x: number, y: number): void {
        drag(new Vector(x, y), new Vector(x, y));
    }

    function drag(from: Vector, to: Vector): void {
        moveMouse(track, from.x, from.y);
        track.lastClick.set(track.mousePos);
        track.toolManager.onMouseDown(mouseEvent());
        moveMouse(track, to.x, to.y);
        track.toolManager.onMouseMove(mouseEvent());
        track.toolManager.onMouseUp(mouseEvent());
    }

    const blocks = () =>
        [...track.layers.main[0].grid.totalObjects.values()].filter(
            (item): item is CommandBlock => item instanceof CommandBlock,
        );

    test('places a block, then drags the area it opens', () => {
        const tool = select();
        expect(tool.getOptions().map((option) => option.label)).toEqual([
            'Command: open (hide area)',
            'Next: click the block position',
        ]);

        click(150, 40);
        expect(tool.getOptions()[1].label).toBe('Next: drag the area to act on');
        drag(new Vector(320, 60), new Vector(280, -120));

        expect(blocks()).toHaveLength(1);
        expect(blocks()[0].pos).toEqual(new Vector(150, 40));
        expect(blocks()[0].settings.area).toEqual(WALL_AREA);
        track.history.undo();
        expect(blocks()).toHaveLength(0);
    });

    test('places a move block in three steps, and cycles the commands and durations', () => {
        const tool = select();
        // Show, then move
        tool.getOptions()[0].action();
        tool.getOptions()[0].action();
        expect(tool.getOptions()[0].label).toBe('Command: move area');
        expect(tool.getOptions()[1].label).toBe('Duration: 1 s');
        tool.getOptions()[1].action();

        click(150, 40);
        drag(new Vector(280, -120), new Vector(320, 60));
        click(300, -330);

        const [placed] = blocks();
        expect(placed.settings.kind).toBe('move');
        expect(placed.settings.offset).toEqual(new Vector(0, -300));
        expect(placed.settings.duration).toBe(100);
    });

    test('ignores the right button, dragging the camera', () => {
        const tool = select();
        moveMouse(track, 150, 40);
        track.toolManager.onMouseDown(mouseEvent(2));
        track.toolManager.onMouseUp(mouseEvent(2));
        click(150, 40);
        moveMouse(track, 280, -120);
        track.toolManager.onMouseDown(mouseEvent(2));
        moveMouse(track, 320, 60);
        track.toolManager.onMouseUp(mouseEvent(2));

        // Still waiting for the area, after the block placed by the left click
        expect(blocks()).toHaveLength(0);
        expect(tool.getOptions()[1].label).toBe('Next: drag the area to act on');
    });

    test('previews the block being placed only, not the offset of the previous one', () => {
        const tool = select();
        tool.getOptions()[0].action();
        tool.getOptions()[0].action();
        click(150, 40);
        drag(new Vector(280, -120), new Vector(320, 60));
        click(300, -330);

        const renderSettings = vi.spyOn(CommandBlock, 'renderSettings');
        const ctx = createCanvasMock().context as unknown as CanvasRenderingContext2D;
        click(150, 40);
        moveMouse(track, 280, -120);
        track.toolManager.onMouseDown(mouseEvent());
        moveMouse(track, 320, 60);
        tool.render(ctx);
        // Dragging the area: not moved yet
        expect(renderSettings.mock.lastCall?.[3]).toMatchObject({ kind: 'hide', area: WALL_AREA });

        // A camera block links to the mouse, not to the point of the previous one
        track.toolManager.onMouseUp(mouseEvent());
        tool.getOptions()[0].action();
        tool.getOptions()[0].action();
        click(150, 40);
        click(800, -100);
        click(150, 40);
        moveMouse(track, 400, 0);
        tool.render(ctx);
        expect(renderSettings.mock.lastCall?.[3].target).toEqual(new Vector(400, 0));
    });

    test('places a camera block on the point it shows, and a zoom block in a click', () => {
        const tool = select();
        // Zoom, after cycling through every command
        for (let option = 0; option < 3; option++) {
            tool.getOptions()[0].action();
        }
        expect(tool.getOptions()[0].label).toBe('Command: zoom');
        click(100, 40);
        tool.getOptions()[0].action();
        click(150, 40);
        click(800, -100);

        const [zoom, camera] = blocks();
        expect(zoom.settings.kind).toBe('zoom');
        expect(camera.settings).toMatchObject({ kind: 'camera', target: new Vector(800, -100) });
    });
});

describe('Command block bindings and rendering', () => {
    const layer = () => track.layers.main[0];
    /** Lines of the render cache of the layer, each line once per cell it crosses. */
    const cachedLines = () => [...layer().cache.cells.values()].flatMap((cell) => cell.lines);
    const versions = () => [...layer().cache.cells.values()].map((cell) => cell.contentVersion);

    test('only bind the objects inside the area of the block with the lowest id', () => {
        const first = block(150, 40, { kind: 'hide', area: WALL_AREA });
        const second = block(170, 40, { kind: 'show', area: { ...WALL_AREA, right: 520 } });
        const door = wall(300);
        const other = wall(500);
        track.commands.refresh();
        expect(door.command).toBe(first);
        expect(other.command).toBe(second);

        // The second block takes the door, then gives it back to the first one put back
        first.removeFromTrack();
        track.commands.refresh();
        expect(door.command).toBe(second);
        first.addToTrack();
        track.commands.refresh();
        expect(door.command).toBe(first);
        expect([...track.commands.boundTo(second)]).toEqual([other]);
    });

    test('leave the render cache alone when the track changes away from their objects', () => {
        block(150, 40, { kind: 'hide', area: WALL_AREA });
        const door = wall(300);
        track.commands.refresh();
        const before = versions();

        const far = place(new SolidLine(new Vector(5000, -5000), new Vector(5100, -5000), track));
        track.commands.refresh();
        // Only the cells of the new line changed
        expect(versions().slice(0, before.length)).toEqual(before);
        expect(far.command).toBeNull();
        expect(door.command).not.toBeNull();
    });

    test('keep an object removed and added back out of the render cache once', () => {
        block(150, 40, { kind: 'hide', area: WALL_AREA });
        const door = wall(300);
        track.commands.refresh();

        // Undone and redone between two frames
        door.removeFromTrack();
        door.addToTrack();
        track.commands.refresh();
        expect(cachedLines()).not.toContain(door);
        door.removeFromTrack();
        track.commands.refresh();
        expect(door.command).toBeNull();
        expect(cachedLines()).not.toContain(door);
        expect(track.commands.boundTo(door.command as never).size).toBe(0);
    });

    test('draw a group from the images of its tiles, whatever its number of lines', () => {
        const command = block(150, 40, {
            kind: 'move',
            area: { left: 0, top: -390, right: 390, bottom: -10 },
            offset: new Vector(0, 200),
            duration: 50,
        });
        for (let i = 0; i < 2000; i++) {
            place(
                new SolidLine(
                    new Vector(5 + (i % 380), -380 + i / 6),
                    new Vector(9 + (i % 380), -380 + i / 6),
                    track,
                ),
            );
        }
        track.commands.refresh();
        expect(track.commands.boundTo(command).size).toBe(2000);

        const { context, calls } = createCanvasMock();
        track.commands.render(context, layer(), false);
        // One tile, drawn as an image: no line drawn on the canvas of the track
        expect(calls.filter((call) => call === 'drawImage')).toHaveLength(1);
        expect(calls).not.toContain('stroke');

        // Moved down by half its way, then out of the view
        trigger(command, track.playerRunner);
        track.playerRunner.time += 25;
        calls.length = 0;
        track.commands.render(context, layer(), false);
        const [, , y] = vi.mocked(context.drawImage).mock.lastCall as unknown as number[];
        const zoom = track.zoomFactor;
        expect(y).toBe(Math.floor(track.viewHeight / 2 + (-400 + 100 - track.camera.y) * zoom) - 1);
        track.camera.set(new Vector(20000, 0));
        calls.length = 0;
        track.commands.render(context, layer(), false);
        expect(calls).not.toContain('drawImage');
    });

    test('show what they act on in the editor only, never while racing', () => {
        block(150, 40, { kind: 'hide', area: WALL_AREA });
        const door = wall(300);
        const command = [...layer().grid.totalObjects.values()].find(
            (item): item is CommandBlock => item instanceof CommandBlock,
        );
        if (!command) throw new Error('No block');
        trigger(command, track.playerRunner);
        track.commands.refresh();
        const renderSettings = vi.spyOn(CommandBlock, 'renderSettings');
        const { context, calls } = createCanvasMock();

        track.editing = false;
        command.render(context);
        track.commands.render(context, layer(), false);
        expect(renderSettings).not.toHaveBeenCalled();
        // The opened door is not drawn at all
        expect(calls).not.toContain('drawImage');

        track.editing = true;
        command.render(context);
        track.commands.render(context, layer(), false);
        expect(renderSettings).toHaveBeenCalled();
        expect(calls).toContain('drawImage');
        expect(door.command).toBe(command);
    });
});
