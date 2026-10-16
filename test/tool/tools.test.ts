import { Keyboard, Vector } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkedItem } from '../../src/openrider/item/linked-item';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { Target } from '../../src/openrider/item/reachable/target';
import { ItemGroupTool } from '../../src/openrider/tool/group/group.tools';
import { BoostTool, TargetTool, TeleporterTool } from '../../src/openrider/tool/item/item.tools';
import { SolidBrushTool, SolidLineTool } from '../../src/openrider/tool/line/line.tools';
import { CameraTool } from '../../src/openrider/tool/misc/camera.tool';
import { CancelCheckpointTool } from '../../src/openrider/tool/misc/cancel-checkpoint.tool';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { FocusGhostTool } from '../../src/openrider/tool/misc/focus-ghost.tool';
import { FullscreenTool } from '../../src/openrider/tool/misc/fullscreen.tool';
import { GhostRunner } from '../../src/openrider/bike/runner/ghost-runner';
import { RedoTool, UndoTool } from '../../src/openrider/tool/misc/history.tool';
import { PauseTool } from '../../src/openrider/tool/misc/pause.tool';
import { StartPositionTool } from '../../src/openrider/tool/misc/start-position.tool';
import { SwitchBikeTool } from '../../src/openrider/tool/misc/switch-bike.tool';
import { Tool, ToolClass } from '../../src/openrider/tool/tool';
import {
    GridSnapTool,
    ToggleDebugTool,
    ToggleFastRenderTool,
} from '../../src/openrider/tool/toggle/toggle.tools';
import {
    LEFT_TOOLBAR_EDITING,
    RIGHT_TOOLBAR,
    UPLOAD_TOOLBAR,
} from '../../src/openrider/tool/toolbar.constants';
import { ToolGroupTool } from '../../src/openrider/tool/group/tool-group.tool';
import { Track } from '../../src/openrider/track/track';
import { createCanvasMock, stubBrowser } from '../helpers/canvas';
import { keyEvent, mouseEvent, moveMouse, parseTrack } from '../helpers/track';

let track: Track;

/** Creates a tool, registers it like the interface layer does and selects it. */
function select<T extends Tool>(toolClass: new (track: Track) => T): T {
    const tool = new toolClass(track);
    tool.registerControls();
    track.toolCollection.add(tool);
    track.toolManager.setTool(tool);
    return tool;
}

/** Presses the mouse at a world position and moves it to another one before releasing it. */
function drag(from: Vector, to: Vector, steps = 1, onStep?: () => void): void {
    moveMouse(track, from.x, from.y);
    track.lastClick.set(track.mousePos);
    track.toolManager.onMouseDown(mouseEvent());
    for (let step = 1; step <= steps; step++) {
        const progress = step / steps;
        moveMouse(track, from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        track.toolManager.onMouseMove(mouseEvent());
        onStep?.();
    }
    track.toolManager.onMouseUp(mouseEvent());
}

function click(x: number, y: number): void {
    drag(new Vector(x, y), new Vector(x, y), 0);
}

const solidLines = () => [...track.mainLayer.grid.totalSolidLines.values()];
const objects = () => [...track.mainLayer.grid.totalObjects.values()];

beforeEach(() => {
    stubBrowser();
    track = parseTrack('#####BMX#0 0');
});

afterEach(() => {
    // Release every key pressed by a test, before removing the document receiving the events
    for (const code of ['KeyQ', 'KeyA']) {
        Keyboard.onKeyUp(keyEvent(code, code.slice(3).toLowerCase()));
    }
    vi.unstubAllGlobals();
});

describe('Line tools', () => {
    test('ignore a click without moving the mouse', () => {
        select(SolidLineTool);

        click(10, 10);

        expect(solidLines()).toHaveLength(0);
        track.history.undo();
    });

    test('draw a line from the click to the release position, undone at once', () => {
        select(SolidLineTool);

        drag(new Vector(0, 0), new Vector(100, 20));

        expect(solidLines()).toHaveLength(1);
        expect(solidLines()[0].pos).toEqual(new Vector(0, 0));
        expect(solidLines()[0].endPos).toEqual(new Vector(100, 20));

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
        track.history.redo();
        expect(solidLines()).toHaveLength(1);
    });

    test('draw on the foreground layer when the option is enabled', () => {
        const tool = select(SolidLineTool);
        tool.getOptions()[0].action();
        expect(tool.getOptions()[0].label).toBe('Layer: Foreground');
        expect(track.uiInvalidated).toBe(true);

        drag(new Vector(0, 0), new Vector(100, 0));

        expect(track.foregroundLayer.grid.totalSolidLines.size).toBe(1);
        expect(solidLines()).toHaveLength(0);
    });

    test('draw connected lines on each click while the tool key is held', () => {
        select(SolidLineTool);
        Keyboard.onKeyDown(keyEvent('KeyQ', 'q'));

        for (const x of [0, 50, 100]) {
            moveMouse(track, x, 0);
            track.toolManager.onMouseDown(mouseEvent());
            track.toolManager.onMouseUp(mouseEvent());
        }

        // The first click only starts the polyline at the mouse position
        expect(solidLines().map((line) => [line.pos.x, line.endPos.x])).toEqual([
            [0, 50],
            [50, 100],
        ]);
    });

    test('a brush stroke draws a line each time the mouse moves further than its size', () => {
        const tool = select(SolidBrushTool);

        drag(new Vector(0, 0), new Vector(200, 0), 20, () => tool.update(0, 16));

        // 20 units brush: one line every 20 units, plus the last segment on release
        expect(solidLines().length).toBeGreaterThanOrEqual(9);
        const end = Math.max(...solidLines().map((line) => line.endPos.x));
        expect(end).toBe(200);

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
    });

    test('scroll the camera when drawing near the canvas borders', () => {
        select(SolidLineTool);
        moveMouse(track, 0, 0);
        track.toolManager.onMouseDown(mouseEvent());
        // Near the right border of the 700 pixels wide canvas
        moveMouse(track, track.toWorld(new Vector(690, 200)).x, 0);
        const cameraX = track.camera.x;

        track.toolManager.update(0, 100);

        expect(track.camera.x).toBeGreaterThan(cameraX);
    });
});

describe('Eraser', () => {
    test('erases what it touches during a drag, restored at once', () => {
        for (const y of [0, 40, 80]) {
            const line = new SolidLine(new Vector(-50, y), new Vector(50, y), track);
            line.layer = track.mainLayer;
            line.addToTrack();
        }
        select(EraserTool);

        drag(new Vector(0, -10), new Vector(0, 90), 10);
        expect(solidLines()).toHaveLength(0);

        track.history.undo();
        expect(solidLines()).toHaveLength(3);
    });

    test('lets the player choose what to erase', () => {
        const tool = select(EraserTool);
        const options = tool.getOptions();

        expect(options.map((option) => option.label)).toEqual([
            'Foreground Line: active',
            'Foreground Scenery: active',
            'Main Line: active',
            'Main Scenery: active',
            'Main Object: active',
        ]);
        options[2].action();
        expect(tool.getOptions()[2].label).toBe('Main Line: inactive');

        const line = new SolidLine(new Vector(-50, 0), new Vector(50, 0), track);
        line.layer = track.mainLayer;
        line.addToTrack();
        drag(new Vector(0, 0), new Vector(0, 0), 1);
        expect(line.onTrack).toBe(true);
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
});

describe('Tool manager', () => {
    test('toggles the options when selecting the current tool again', () => {
        const tool = select(SolidLineTool);
        expect(tool.optionsOpen).toBe(true);
        expect(tool.isActive()).toBe(true);

        tool.run();
        expect(tool.optionsOpen).toBe(false);
        tool.run();
        expect(tool.optionsOpen).toBe(true);

        select(TargetTool);
        expect(tool.optionsOpen).toBe(false);
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
        const fastRender = new ToggleFastRenderTool(track);

        gridSnap.run();
        debug.run();
        fastRender.run();
        expect(track.gridDetail).toBe(10);
        expect(track.debug && track.fastRender).toBe(true);
        expect([gridSnap, debug, fastRender].every((tool) => tool.isToggled())).toBe(true);

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

    test('change the brush and eraser sizes when scrolling with their key held', () => {
        const brush = select(SolidBrushTool);
        Keyboard.onKeyDown(keyEvent('KeyA', 'a'));
        const zoom = track.zoomFactor;

        brush.onScroll({ deltaY: -100 } as WheelEvent);
        brush.onScroll({ deltaY: -100 } as WheelEvent);
        Keyboard.onKeyUp(keyEvent('KeyA', 'a'));

        expect(track.zoomFactor).toBe(zoom);
        const { context } = createCanvasMock();
        track.mouseIn = true;
        track.toolManager.onMouseMove(mouseEvent());
        track.toolManager.render(context);
        expect(vi.mocked(context.fillText).mock.calls.map(([text]) => text)).toContain('36');
    });

    test('focus the ghosts in turn', () => {
        const ghosts = [1, 2].map((id) => {
            const ghost = new GhostRunner(track, ',,,,,100,BMX,Ghost');
            ghost.createBike();
            track.ghostRunners.set(id, ghost);
            return ghost;
        });
        const focus = new FocusGhostTool(track);
        track.focalPoint = track.playerRunner.instance?.hitbox ?? null;

        focus.run();
        expect(track.focalPoint).toBe(ghosts[1].instance?.hitbox);
        focus.run();
        expect(track.focalPoint).toBe(ghosts[0].instance?.hitbox);
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
            expect(tool.toolClass.keyLabel).not.toBeNull();
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
