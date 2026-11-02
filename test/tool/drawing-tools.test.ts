import { Keyboard, Vector } from 'canvade';
import { describe, expect, test } from 'vitest';
import { SolidLine } from '../../src/openrider/item/line/solid-line';
import { BrushTool } from '../../src/openrider/tool/line/brush.tool';
import { LineTool } from '../../src/openrider/tool/line/line.tool';
import { LineGroupTool } from '../../src/openrider/tool/group/group.tools';
import {
    SCENERY_CIRCLE_ICON,
    SCENERY_CURVE_ICON,
    SCENERY_LINE_ICON,
    lineIcon,
    SOLID_CIRCLE_ICON,
    SOLID_CURVE_ICON,
    SOLID_BRUSH_ICON,
    SOLID_LINE_ICON,
} from '../../src/openrider/tool/tool-icons';
import { CircleTool, CurveTool } from '../../src/openrider/tool/shape/shape.tools';
import { EraserTool } from '../../src/openrider/tool/misc/eraser.tool';
import { createCanvasMock } from '../helpers/canvas';
import { keyEvent, mouseEvent, moveMouse } from '../helpers/track';
import { track, select, drag, click, solidLines, useToolTrack } from './tool-helpers';

useToolTrack();

describe('Line tools', () => {
    test('ignore a click without moving the mouse', () => {
        select(LineTool);

        click(10, 10);

        expect(solidLines()).toHaveLength(0);
        track.history.undo();
    });

    test('draw solid or scenery lines as chosen in the options, shared by the drawing tools', () => {
        const line = select(LineTool);
        const sceneryLines = () => [...track.layers.main[0].grid.totalSceneryLines.values()];
        expect(line.getOptions()[0].label).toBe('Lines: solid');
        expect(line.getIcon()).toBe(SOLID_LINE_ICON);

        line.getOptions()[0].action!();
        drag(new Vector(0, 0), new Vector(100, 0));
        expect(solidLines()).toHaveLength(0);
        expect(sceneryLines()).toHaveLength(1);
        expect(line.getIcon()).toBe(SCENERY_LINE_ICON);

        // The same for the brush and the shapes
        expect(select(BrushTool).getOptions()[0].label).toBe('Lines: scenery');
        expect(select(CircleTool).getOptions()[0].label).toBe('Lines: scenery');
        // Their icons drawn with the color of the lines
        expect(select(CircleTool).getIcon()).toBe(SCENERY_CIRCLE_ICON);
        expect(select(CurveTool).getIcon()).toBe(SCENERY_CURVE_ICON);
        select(CurveTool).getOptions()[0].action!();
        expect(select(CurveTool).getIcon()).toBe(SOLID_CURVE_ICON);
        expect(select(CircleTool).getIcon()).toBe(SOLID_CIRCLE_ICON);
    });

    test('draw scenery lines in the color chosen in the options, solid lines having none', () => {
        const line = select(LineTool);
        const sceneryLines = () => [...track.layers.main[0].grid.totalSceneryLines.values()];
        // Only the scenery lines have a color
        expect(line.getOptions().some((option) => option.swatches)).toBe(false);
        line.getOptions()[0].action?.();
        expect(line.getOptions()[1].label).toBe('Color: Grey');

        // Every color as a swatch, the current one selected
        expect(line.getOptions()[1].swatches).toMatchObject({ selected: 0 });
        expect(line.getOptions()[1].swatches?.colors).toHaveLength(16);
        line.getOptions()[1].swatches?.select(15);
        expect(line.getOptions()[1].label).toBe('Color: Slate');
        // Clicking the option goes to the next color, the first after the last
        line.getOptions()[1].action?.();
        line.getOptions()[1].swatches?.select(1);
        expect(line.getOptions()[1].label).toBe('Color: Rose');
        expect(line.getOptions()[1].swatches?.selected).toBe(1);
        expect(line.getIcon()).toBe(lineIcon(1));
        expect(line.getIcon()).not.toBe(SCENERY_LINE_ICON);

        drag(new Vector(0, 0), new Vector(100, 0));
        expect(sceneryLines().map((scenery) => scenery.color)).toEqual([1]);

        // Solid lines keep no color
        line.getOptions()[0].action?.();
        drag(new Vector(0, 50), new Vector(100, 50));
        expect(solidLines().map((solid) => solid.color)).toEqual([0]);
    });

    test('change the brush size from its options only, stepping it down and up', () => {
        const brush = select(BrushTool);
        const option = () => brush.getOptions().find(({ label }) => label.startsWith('Size'))!;
        expect(option().label).toBe('Size: 20');

        option().steps?.down();
        expect(option().label).toBe('Size: 10');
        option().steps?.down();
        option().steps?.down();
        // The smallest size stays
        expect(option().label).toBe('Size: 4');
        option().steps?.up();
        expect(option().label).toBe('Size: 10');

        // Clicking it goes to the next size, the smallest after the largest one
        option().action!();
        option().action!();
        option().action!();
        option().action!();
        expect(option().label).toBe('Size: 160');
        option().steps?.up();
        expect(option().label).toBe('Size: 160');
        option().action!();
        expect(option().label).toBe('Size: 4');
    });

    test('are grouped, the brush first', () => {
        const group = new LineGroupTool(track);
        expect(group.instances.map((tool) => tool.toolClass.toolName)).toEqual(['Brush', 'Line']);
        expect(group.getIcon()).toBe(SOLID_BRUSH_ICON);
    });

    test('draw a line from the click to the release position, undone at once', () => {
        select(LineTool);

        drag(new Vector(0, 0), new Vector(100, 20));

        expect(solidLines()).toHaveLength(1);
        expect(solidLines()[0].pos).toEqual(new Vector(0, 0));
        expect(solidLines()[0].endPos).toEqual(new Vector(100, 20));

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
        track.history.redo();
        expect(solidLines()).toHaveLength(1);
    });

    test('draw on the active layer, showing it when it is hidden', () => {
        select(LineTool);
        const foreground = track.layers.foreground[0];
        track.layers.setActive(foreground);
        track.layers.setVisible(foreground, false);

        drag(new Vector(0, 0), new Vector(100, 0));

        expect(foreground.grid.totalSolidLines.size).toBe(1);
        expect(foreground.visible).toBe(true);
        expect(solidLines()).toHaveLength(0);
    });

    test('draw connected lines on each click while the tool key is held', () => {
        select(LineTool);
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

    test('connect the lines with the option, as with the key held, on touch screens', () => {
        const line = select(LineTool);
        const connect = () => line.getOptions().find(({ label }) => label.startsWith('Connect'))!;
        drag(new Vector(-300, 0), new Vector(-200, 0));
        expect(connect().label).toBe('Connect: off');

        connect().action!();
        expect(connect().label).toBe('Connect: on');
        // Switched on, the first line starts afresh, then each one at the end of the previous one,
        // wherever the pointer is pressed
        drag(new Vector(0, 0), new Vector(50, 0));
        drag(new Vector(400, 400), new Vector(100, 20));
        drag(new Vector(-50, 90), new Vector(150, 0));

        expect(solidLines().map(({ pos, endPos }) => [pos.x, pos.y, endPos.x, endPos.y])).toEqual([
            [-300, 0, -200, 0],
            [0, 0, 50, 0],
            [50, 0, 100, 20],
            [100, 20, 150, 0],
        ]);
        // Shared by the brush
        expect(
            select(BrushTool)
                .getOptions()
                .map(({ label }) => label),
        ).toContain('Connect: on');
    });

    test('mark the start of the next connected line, also once the finger is lifted', () => {
        const line = select(LineTool);
        line.getOptions().find(({ label }) => label.startsWith('Connect'))!.action!();
        drag(new Vector(0, 0), new Vector(50, 0));
        /** Arcs and strokes the tool draws, the pointer out of the canvas as a lifted finger. */
        const drawn = () => {
            track.mouseIn = false;
            const { context, calls } = createCanvasMock();
            track.toolManager.render(context);
            return calls;
        };

        expect(drawn()).toContain('arc');
        // No crosshair without a pointer: only the marker
        expect(drawn().filter((call) => call === 'stroke')).toHaveLength(1);
        line.getOptions().find(({ label }) => label.startsWith('Connect'))!.action!();
        expect(drawn()).toEqual([]);
    });

    test('start each brush stroke at the end of the previous one with the connect option', () => {
        const brush = select(BrushTool);
        brush.getOptions().find(({ label }) => label.startsWith('Connect'))!.action!();
        // Idle until the first stroke, which starts where it is pressed
        moveMouse(track, 500, 500);
        brush.update(0, 16);

        drag(new Vector(0, 0), new Vector(100, 0), 5, () => brush.update(0, 16));
        const firstStroke = solidLines().length;
        drag(new Vector(120, 60), new Vector(120, 100), 2, () => brush.update(0, 16));

        const lines = solidLines();
        expect(lines[0].pos).toEqual(new Vector(0, 0));
        // The second stroke goes on from the end of the first one
        expect(lines[firstStroke].pos).toEqual(new Vector(100, 0));
        expect(lines.at(-1)?.endPos).toEqual(new Vector(120, 100));
    });

    test('a brush stroke draws a line each time the mouse moves further than its size', () => {
        const tool = select(BrushTool);

        drag(new Vector(0, 0), new Vector(200, 0), 20, () => tool.update(0, 16));

        // 20 units brush: one line every 20 units, plus the last segment on release
        expect(solidLines().length).toBeGreaterThanOrEqual(9);
        const end = Math.max(...solidLines().map((line) => line.endPos.x));
        expect(end).toBe(200);

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
    });

    test('scroll the camera when drawing near the canvas borders', () => {
        select(LineTool);
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
            line.layer = track.layers.main[0];
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
            'Size: 15',
            'Layers: active',
            'Line: active',
            'Scenery: active',
            'Object: active',
        ]);
        options[2].action!();
        expect(tool.getOptions()[2].label).toBe('Line: inactive');
        options[0].steps?.down();
        expect(tool.getOptions()[0].label).toBe('Size: 10');

        const line = new SolidLine(new Vector(-50, 0), new Vector(50, 0), track);
        line.layer = track.layers.main[0];
        line.addToTrack();
        drag(new Vector(0, 0), new Vector(0, 0), 1);
        expect(line.onTrack).toBe(true);
    });
});

describe('Shape tools', () => {
    const sceneryLines = () => [...track.layers.main[0].grid.totalSceneryLines.values()];

    test('draw a circle from its center to its radius, undone at once', () => {
        select(CircleTool);
        drag(new Vector(0, 0), new Vector(100, 0));

        const lines = solidLines();
        // About 20 units long each, all around
        expect(lines).toHaveLength(31);
        for (const line of lines) {
            expect(Math.abs(line.pos.getLength() - 100)).toBeLessThanOrEqual(1);
            expect(Number.isInteger(line.pos.x) && Number.isInteger(line.pos.y)).toBe(true);
        }
        // Closed, each line starting where the previous one ends
        expect(lines[0].pos).toEqual(lines[lines.length - 1].endPos);
        lines.slice(1).forEach((line, i) => expect(line.pos).toEqual(lines[i].endPos));

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
        track.history.redo();
        expect(solidLines()).toHaveLength(31);
    });

    test('draw nothing for a click, and scenery lines once chosen', () => {
        const circle = select(CircleTool);
        click(50, 50);
        expect(solidLines()).toHaveLength(0);

        expect(circle.getOptions()[0].label).toBe('Lines: solid');
        circle.getOptions()[0].action!();
        expect(circle.getOptions()[0].label).toBe('Lines: scenery');
        drag(new Vector(0, 0), new Vector(0, 40));
        expect(solidLines()).toHaveLength(0);
        expect(sceneryLines()).toHaveLength(13);

        // Shared by the shape tools
        expect(select(CurveTool).getOptions()[0].label).toBe('Lines: scenery');
        circle.getOptions()[0].action!();
    });

    test('draw a curve from its start to its end, through the point clicked then', () => {
        const curve = select(CurveTool);
        drag(new Vector(0, 0), new Vector(200, 0));
        expect(solidLines()).toHaveLength(0);
        // The next step as a label, the curve drawn again from its start with Restart
        const options = () =>
            curve.getOptions().map(({ label, action }) => [label, Boolean(action)]);
        expect(options().slice(1)).toEqual([
            ['Next: click where the curve passes', false],
            ['Restart', true],
        ]);
        curve.getOptions()[2].action!();
        expect(options().slice(1)).toEqual([['Next: drag from its start to its end', false]]);
        drag(new Vector(0, 0), new Vector(200, 0));

        click(100, -50);
        const lines = solidLines();
        expect(lines.length).toBeGreaterThan(5);
        expect(lines[0].pos).toEqual(new Vector(0, 0));
        expect(lines[lines.length - 1].endPos).toEqual(new Vector(200, 0));
        expect(lines.some(({ endPos }) => endPos.x === 100 && endPos.y === -50)).toBe(true);
        lines.slice(1).forEach((line, i) => expect(line.pos).toEqual(lines[i].endPos));
        expect(curve.getOptions()[1].label).toBe('Next: drag from its start to its end');

        track.history.undo();
        expect(solidLines()).toHaveLength(0);
    });

    test('start no curve with a click, and forget the curve started when changing tool', () => {
        const curve = select(CurveTool);
        click(10, 10);
        click(20, 20);
        expect(solidLines()).toHaveLength(0);

        drag(new Vector(0, 0), new Vector(200, 0));
        select(LineTool);
        track.toolManager.setTool(curve);
        click(100, -50);
        // The click started nothing: the curve was forgotten
        expect(solidLines()).toHaveLength(0);
        expect(curve.getOptions()[1].label).toBe('Next: drag from its start to its end');
    });
});
