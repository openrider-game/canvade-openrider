import { Keyboard, Vector } from 'canvade';
import { describe, expect, test, vi } from 'vitest';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { ItemGroupTool } from '../../src/openrider/tool/group/group.tools';
import { LinkedCheckpoint } from '../../src/openrider/item/linked/linked-checkpoint';
import {
    BoostTool,
    LinkedCheckpointTool,
    TargetTool,
    TeleporterTool,
} from '../../src/openrider/tool/item/item.tools';
import { BrushTool } from '../../src/openrider/tool/line/brush.tool';
import { LineTool } from '../../src/openrider/tool/line/line.tool';
import { CameraTool } from '../../src/openrider/tool/misc/camera.tool';
import { CancelCheckpointTool } from '../../src/openrider/tool/misc/cancel-checkpoint.tool';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { FocusRiderTool } from '../../src/openrider/tool/misc/focus-rider.tool';
import { RemoteRunner } from '../../src/openrider/bike/runner/remote-runner';
import { FullscreenTool } from '../../src/openrider/tool/misc/fullscreen.tool';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { RedoTool, UndoTool } from '../../src/openrider/tool/misc/history.tool';
import { PauseTool } from '../../src/openrider/tool/misc/pause.tool';
import { StartPositionTool } from '../../src/openrider/tool/misc/start-position.tool';
import { SwitchBikeTool } from '../../src/openrider/tool/misc/switch-bike.tool';
import { Tool, ToolClass } from '../../src/openrider/tool/tool';
import { GridSnapTool, ToggleDebugTool } from '../../src/openrider/tool/toggle/toggle.tools';
import {
    LEFT_TOOLBAR_EDITING,
    RIGHT_TOOLBAR,
    UPLOAD_TOOLBAR,
} from '../../src/openrider/tool/toolbar.constants';
import { ToolGroupTool } from '../../src/openrider/tool/group/tool-group.tool';
import { Track } from '../../src/openrider/track/track';
import { createCanvasMock } from '../helpers/canvas';
import { keyEvent, mouseEvent, moveMouse } from '../helpers/track';
import { track, select, drag, click, objects, useToolTrack } from './tool-helpers';

useToolTrack();

describe('Tools on layers', () => {
    test('the eraser erases the active layer only, or every visible layer', () => {
        const tool = select(EraserTool);
        const [main] = track.layers.main;
        const upper = track.layers.add('main');
        const hidden = track.layers.add('foreground');
        track.layers.setVisible(hidden, false);
        const lines = [main, upper, hidden].map((layer) => {
            const line = new SolidLine(new Vector(-50, 0), new Vector(50, 0), track);
            line.layer = layer;
            line.addToTrack();
            return line;
        });
        track.layers.setActive(upper);

        drag(new Vector(0, 0), new Vector(0, 0), 1);
        expect(lines.map((line) => line.onTrack)).toEqual([true, false, true]);

        tool.getOptions()[1].action!();
        expect(tool.getOptions()[1].label).toBe('Layers: all visible');
        drag(new Vector(0, 0), new Vector(0, 0), 1);
        expect(lines.map((line) => line.onTrack)).toEqual([false, false, true]);
    });

    test('items go to the closest main layer under a foreground active layer', () => {
        select(TargetTool);
        const upper = track.layers.add('main');
        track.layers.add('foreground');

        click(30, 40);

        expect(upper.grid.totalObjects.size).toBe(1);
        expect(objects()).toHaveLength(0);
        expect(track.targets.size).toBe(1);
    });
});

describe('Item tools', () => {
    test('place an item on click, undone like any edit', () => {
        select(TargetTool);

        click(30, 40);

        expect(objects()).toHaveLength(1);
        expect(objects()[0]).toBeInstanceOf(Target);
        expect(objects()[0].pos).toEqual(new Vector(30, 40));
        track.history.undo();
        expect(objects()).toHaveLength(0);
    });

    test('place a directional item pointing from the click to the release position', () => {
        select(BoostTool);

        drag(new Vector(0, 0), new Vector(-10, 0));

        const boost = objects()[0] as unknown as { rotation: number; direction: Vector };
        expect(boost.rotation).toBe(90);
        expect(boost.direction.x).toBeCloseTo(-1);
    });

    test('place linked items once every item of the group is placed', () => {
        select(TeleporterTool);

        click(0, 0);
        expect(objects()).toHaveLength(0);
        click(100, 0);

        expect(objects()).toHaveLength(2);
        const [entry, exit] = objects() as LinkedItem[];
        expect(entry.group).toBe(exit.group);
        track.history.undo();
        expect(objects()).toHaveLength(0);
    });

    test('place a pair of linked checkpoints', () => {
        select(LinkedCheckpointTool);

        click(0, 0);
        click(100, 0);

        const checkpoints = objects() as LinkedItem[];
        expect(checkpoints).toHaveLength(2);
        expect(checkpoints.every((item) => item instanceof LinkedCheckpoint)).toBe(true);
        expect(checkpoints[0].group).toBe(checkpoints[1].group);
    });
});

describe('Tool manager', () => {
    test('keeps the current tool when selecting it again', () => {
        const tool = select(LineTool);
        expect(tool.isActive()).toBe(true);
        track.uiInvalidated = false;

        tool.run();
        expect(tool.isActive()).toBe(true);
        expect(track.uiInvalidated).toBe(false);

        select(TargetTool);
        expect(tool.isActive()).toBe(false);
    });

    test('drags the camera with the right mouse button, whatever the tool', () => {
        const camera = new CameraTool(track);
        track.toolManager.setCamera(camera);
        select(TargetTool);
        moveMouse(track, 100, 100);
        track.lastClick.set(track.mousePos);

        track.toolManager.onMouseDown(mouseEvent(2));
        moveMouse(track, 80, 90);
        track.toolManager.onMouseMove(mouseEvent(2));
        track.toolManager.onMouseUp(mouseEvent(2));

        expect(objects()).toHaveLength(0);
        expect(track.camera).toMatchObject({ x: 20, y: 10 });
    });

    test('renders the current tool only while the mouse is used on the track', () => {
        const tool = select(TargetTool);
        const render = vi.spyOn(tool, 'render');
        const ctx = createCanvasMock().context;

        track.toolManager.render(ctx);
        expect(render).not.toHaveBeenCalled();

        track.mouseIn = true;
        track.toolManager.onMouseMove(mouseEvent());
        track.toolManager.render(ctx);
        expect(render).toHaveBeenCalledOnce();

        track.uiHovered = true;
        track.toolManager.render(ctx);
        expect(render).toHaveBeenCalledOnce();
    });

    test('a tool group runs its last selected tool', () => {
        const group = new ItemGroupTool(track);
        group.run();
        const [target, checkpoint] = group.instances;
        expect(group.getIcon()).toBe(target.getIcon());
        expect(track.toolManager.tool).toBe(target);
        expect(group.isActive()).toBe(true);

        checkpoint.run();
        expect(group.currentInstance).toBe(checkpoint);
        expect(group.getIcon()).toBe(checkpoint.getIcon());

        select(CameraTool);
        group.run();
        expect(track.toolManager.tool).toBe(checkpoint);
    });
});

describe('Action tools', () => {
    test('toggle the track settings', () => {
        const gridSnap = new GridSnapTool(track);
        const debug = new ToggleDebugTool(track);

        gridSnap.run();
        debug.run();
        expect(track.gridDetail).toBe(10);
        expect(track.debug).toBe(true);
        expect([gridSnap, debug].every((tool) => tool.isToggled())).toBe(true);

        gridSnap.run();
        expect(track.gridDetail).toBe(1);
        expect(gridSnap.isToggled()).toBe(false);
    });

    test('pause and unpause the race', () => {
        const pause = new PauseTool(track);

        pause.run();
        expect(track.paused).toBe(true);
        expect(pause.getIcon()).toBe('play');
        expect(pause.getLabel()).toBe('Unpause');

        pause.run();
        expect(pause.getLabel()).toBe('Pause');
    });

    test('undo and redo the edits', () => {
        select(TargetTool);
        click(0, 0);

        new UndoTool(track).run();
        expect(objects()).toHaveLength(0);
        new RedoTool(track).run();
        expect(objects()).toHaveLength(1);
    });

    test('cancel the last checkpoint', () => {
        track.playerRunner.mustSave = true;
        track.playerRunner.fixedUpdate();
        expect(track.playerRunner.snapshots).toHaveLength(1);

        new CancelCheckpointTool(track).run();

        expect(track.playerRunner.snapshots).toHaveLength(0);
        expect(track.time).toBe(0);
    });

    test('switch the bike, forgetting the checkpoints', () => {
        const startPosition = new StartPositionTool(track);
        track.toolCollection.add(startPosition);
        track.playerRunner.mustSave = true;
        track.playerRunner.fixedUpdate();

        new SwitchBikeTool(track).run();

        expect(track.playerRunner.bikeClass.bikeName).toBe('MTB');
        expect(track.playerRunner.instance?.bikeClass.bikeName).toBe('MTB');
        expect(track.playerRunner.snapshots).toHaveLength(0);
        new SwitchBikeTool(track).run();
        expect(track.playerRunner.bikeClass.bikeName).toBe('BMX');
    });

    test('move the start position of the track', () => {
        select(StartPositionTool);

        drag(new Vector(0, 0), new Vector(300, -40), 3);

        expect(track.origin).toEqual(new Vector(300, -40));
        track.restart();
        expect(track.playerRunner.instance?.hitbox.pos).toEqual(new Vector(300, -41));
    });
});

describe('View tools', () => {
    test('zoom with the mouse wheel, centered on the mouse', () => {
        select(CameraTool);
        moveMouse(track, 100, 0);
        const zoom = track.zoomFactor;

        track.toolManager.onScroll({ deltaY: -100 } as WheelEvent);

        expect(track.zoomFactor).toBeCloseTo(zoom + 0.2);
    });

    test('zoom with the mouse wheel, the brush and eraser sizes being set in their options', () => {
        const tools: Array<[new (track: Track) => Tool, KeyboardEvent, number]> = [
            [BrushTool, keyEvent('KeyA', 'a'), 1],
            [EraserTool, keyEvent('KeyE', 'e'), 0],
        ];
        for (const [ToolClass, key, sizeIndex] of tools) {
            const tool = select(ToolClass);
            const size = tool.getOptions()[sizeIndex].label;
            const zoom = track.zoomFactor;

            // Even with the key of the tool held
            Keyboard.onKeyDown(key);
            tool.onScroll({ deltaY: -100 } as WheelEvent);
            Keyboard.onKeyUp(key);

            expect(track.zoomFactor).toBeGreaterThan(zoom);
            expect(tool.getOptions()[sizeIndex].label).toBe(size);
        }
    });

    /** Ghosts racing, by id. */
    function addGhosts(ids: number[]): GhostRunner[] {
        return ids.map((id) => {
            const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');
            ghost.createBike();
            track.ghostRunners.set(id, ghost);
            return ghost;
        });
    }

    /** Rider of the live session, riding from the start. */
    function addRemote(id: string): RemoteRunner {
        const remote = new RemoteRunner(track, id);
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'BMX' },
            { type: 'progress', time: 100 },
        ]);
        remote.advance();
        track.remoteRunners.set(id, remote);
        return remote;
    }

    test('focus the riders in turn: the live ones, the ghosts, then the player', () => {
        const ghosts = addGhosts([1, 2]);
        const remotes = [addRemote('ann'), addRemote('bob')];
        const focus = new FocusRiderTool(track);
        // Runner followed by the camera: 0 for the player, then the live riders and the ghosts
        const next = () => {
            focus.run();
            return [track.playerRunner, ...remotes, ...ghosts].findIndex(
                (runner) => runner.instance?.hitbox === track.focalPoint,
            );
        };

        track.focalPoint = track.playerRunner.instance?.hitbox ?? null;
        expect([next(), next(), next(), next(), next(), next()]).toEqual([1, 2, 3, 4, 0, 1]);

        // Racing, the camera starts on the first ghost: the next one comes next
        track.follower.follow(null);
        track.focalPoint = ghosts[0].instance?.hitbox ?? null;
        expect(next()).toBe(4);
    });

    test('focus the ghosts in turn without live session', () => {
        const ghosts = addGhosts([1, 2]);
        const focus = new FocusRiderTool(track);
        track.focalPoint = track.playerRunner.instance?.hitbox ?? null;
        focus.run();
        expect(track.focalPoint).toBe(ghosts[0].instance?.hitbox);
        focus.run();
        focus.run();
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });

    test('keep following a live rider starting over, until the player rides', () => {
        const remote = addRemote('ann');
        new FocusRiderTool(track).run();
        expect(track.follower.followed).toEqual({ kind: 'remote', id: 'ann' });

        // The rider starts over on a new bike, and the player restarts: still followed
        const firstBike = remote.instance;
        remote.receive([
            { type: 'start', time: 0, checkpoints: 0, bike: 'MTB' },
            { type: 'progress', time: 10 },
        ]);
        while (remote.lag > 0) {
            remote.advance();
        }
        expect(remote.instance).not.toBe(firstBike);
        track.restart();
        track.follower.refresh();
        expect(track.focalPoint).toBe(remote.instance?.hitbox);

        // The player rides: the camera follows them again
        track.focalPoint = track.playerRunner.instance?.hitbox ?? null;
        track.follower.refresh();
        expect(track.follower.followed).toBeNull();
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });

    test('follow the player again once the rider followed is gone', () => {
        addRemote('ann');
        new FocusRiderTool(track).run();
        track.remoteRunners.delete('ann');
        track.follower.refresh();

        expect(track.follower.followed).toBeNull();
        expect(track.focalPoint).toBe(track.playerRunner.instance?.hitbox);
    });

    test('toggle the fullscreen mode of the element hosting the canvas', () => {
        const requestFullscreen = vi.fn(async () => {});
        const exitFullscreen = vi.fn(async () => {});
        const documentMock = { fullscreenElement: null as unknown, exitFullscreen };
        vi.stubGlobal('document', documentMock);
        track.canvas = { parentElement: { requestFullscreen } } as unknown as HTMLCanvasElement;
        const fullscreen = new FullscreenTool(track);

        fullscreen.run();
        expect(requestFullscreen).toHaveBeenCalledOnce();

        documentMock.fullscreenElement = {};
        fullscreen.run();
        expect(exitFullscreen).toHaveBeenCalledOnce();
    });
});

describe('Toolbars', () => {
    const toolClasses = (toolbar: Array<ToolClass | null>) =>
        toolbar.filter((toolClass): toolClass is ToolClass => toolClass !== null);

    /** Every tool of the toolbars, with the tools of their groups. */
    function allTools(): Tool[] {
        return [...LEFT_TOOLBAR_EDITING, ...RIGHT_TOOLBAR, ...UPLOAD_TOOLBAR]
            .filter((toolClass): toolClass is ToolClass => toolClass !== null)
            .map((toolClass) => new toolClass(track))
            .flatMap((tool) =>
                tool instanceof ToolGroupTool ? [tool, ...tool.instances] : [tool],
            );
    }

    test('every tool has a name, an icon and a keyboard shortcut', () => {
        for (const tool of allTools()) {
            expect(tool.toolClass.toolName).not.toBe('Tool');
            expect(tool.getIcon()).not.toBeNull();
            expect(tool.getKeyLabel()).not.toBeNull();
            expect(tool.toolClass.key).not.toBeNull();
        }
    });

    test('two tools never share a keyboard shortcut', () => {
        const shortcuts = new Map<string, string>();
        for (const tool of allTools()) {
            const { toolName, key } = tool.toolClass;
            const shortcut = `${key?.codes.join('|')}+${key?.modifiers}`;
            const owner = shortcuts.get(shortcut);
            if (owner !== undefined && owner !== toolName) {
                throw new Error(`${toolName} and ${owner} share the same shortcut`);
            }
            shortcuts.set(shortcut, toolName);
        }

        expect(shortcuts.size).toBeGreaterThan(30);
        expect(toolClasses(UPLOAD_TOOLBAR)).toEqual([CameraTool, expect.anything()]);
    });
});
