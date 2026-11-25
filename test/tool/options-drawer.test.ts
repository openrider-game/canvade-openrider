import { UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandBlockTool } from '../../src/openrider/tool/item/command-block.tool';
import type { ToolOption } from '../../src/openrider/tool/tool';
import type { Track } from '../../src/openrider/track/track';
import { OptionsDrawer } from '../../src/states/track/ui/options-drawer';
import { stubBrowser } from '../helpers/canvas';
import { mouseEvent, moveMouse, parseTrack } from '../helpers/track';

beforeEach(() => {
    stubBrowser();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Types of the elements of the drawer built for options, e.g. `button.option-1`. */
function drawerOf(options: ToolOption[]): string[] {
    const track = { toolManager: { tool: { getOptions: () => options } } } as unknown as Track;
    const structure: UIStructureDefinition = [];
    const styles: UIStyleDefinition = {};
    new OptionsDrawer().build(track, structure, styles);
    return JSON.stringify(structure).match(/(button|text|container)\.[a-z0-9.-]+/g) ?? [];
}

describe('Options drawer', () => {
    test('shows the options without an action as labels, not buttons', () => {
        const elements = drawerOf([
            { label: 'Selected: 3 objects' },
            { label: 'Copy', action: () => {} },
        ]);

        expect(elements).toContain('text.options-label.option-0');
        expect(elements).not.toContain('button.option-0');
        expect(elements).toContain('button.option-1');
    });
});

describe('Options drawer labels', () => {
    /** Styles of the drawer built for options. */
    function stylesOf(options: ToolOption[]): UIStyleDefinition {
        const track = { toolManager: { tool: { getOptions: () => options } } } as unknown as Track;
        const styles: UIStyleDefinition = {};
        new OptionsDrawer().build(track, [], styles);
        return styles;
    }

    test('wraps a label too long for the drawer onto more rows, the panel growing with them', () => {
        const short = stylesOf([{ label: 'Copy', action: () => {} }, { label: 'Next: click' }]);
        const long = stylesOf([
            { label: 'Copy', action: () => {} },
            { label: 'Next: a label far too long to fit on a single row of the options drawer' },
        ]);

        expect(short['.options-row-1']).toBeUndefined();
        const row = long['.options-row-1'] as { height: number };
        const label = long['.option-1'] as { wrap: string };
        expect(label.wrap).toBe('word');
        const rowHeight = (long['.options-row'] as { height: number }).height;
        expect(row.height).toBeGreaterThanOrEqual(2 * rowHeight);
        const height = (styles: UIStyleDefinition) =>
            (styles['.options'] as { height: number }).height;
        expect(height(long) - height(short)).toBe(row.height - rowHeight);
    });

    test('keeps buttons on one row whatever their label', () => {
        const styles = stylesOf([
            {
                label: 'A button far too long to fit on a single row of the drawer',
                action: () => {},
            },
        ]);
        expect(styles['.options-row-0']).toBeUndefined();
    });
});

describe('Command block tool options', () => {
    test('tell the next step as a label, restarting a block once started', () => {
        const track = parseTrack('#####BMX#0 0');
        const tool = new CommandBlockTool(track);
        track.toolCollection.add(tool);
        track.toolManager.setTool(tool);
        const options = () =>
            tool.getOptions().map(({ label, action }) => [label, Boolean(action)]);
        expect(options().at(-1)).toEqual(['Next: click the block position', false]);

        moveMouse(track, 10, 10);
        track.toolManager.onMouseDown(mouseEvent());
        track.toolManager.onMouseUp(mouseEvent());

        expect(options().slice(-2)).toEqual([
            ['Next: drag the area to act on', false],
            ['Restart', true],
        ]);
        tool.getOptions().at(-1)!.action!();
        expect(options().at(-1)).toEqual(['Next: click the block position', false]);
    });
});
