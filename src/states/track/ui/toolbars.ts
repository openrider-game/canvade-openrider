import { UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { ToolGroupTool } from '../../../openrider/tool/group/tool-group.tool';
import { MoreTool } from '../../../openrider/tool/misc/more.tool';
import { Tool } from '../../../openrider/tool/tool';
import type { Track } from '../../../openrider/track/track';
import type { ToolbarDefinition, ToolbarSide } from '../track-view.definitions';
import { TOOL_ELEMENT_TYPE, UIToolButton } from './ui-tool-button';
import { uiMetrics } from './ui-theme';

/** Layout of the tools of an open group, see {@link layoutGroup}. */
export interface GroupLayout {
    /** Position of the first row from the top of the canvas, in UI pixels. */
    top: number;
    rows: number;
    columns: number;
}

/**
 * Lays out the tools of an open group in as few columns as the canvas height allows, the rows
 * balanced between the columns: next to the group button when they fit under it, else moved up
 * just enough to fit in the canvas.
 *
 * @param count - Number of tools of the group.
 * @param buttonTop - Position of the group button from the top of the canvas, in UI pixels.
 * @param height - Height of the canvas in UI pixels, `Infinity` while it is unknown.
 * @param toolSize - Side of the tool buttons, in UI pixels.
 */
export function layoutGroup(
    count: number,
    buttonTop: number,
    height: number,
    toolSize = uiMetrics().toolSize,
): GroupLayout {
    // A single column while the height is unknown
    const maxRows = Math.max(1, Math.min(count, Math.floor(height / toolSize)));
    const columns = Math.ceil(count / maxRows);
    const rows = Math.ceil(count / columns);
    const top = Math.max(0, Math.min(buttonTop, height - rows * toolSize));

    return { top, rows, columns };
}

/** Toolbar with the tools created when entering the state. */
interface Toolbar {
    side: ToolbarSide;
    tools: Array<Tool | null>;
    /** Last button of the toolbar when its tools do not fit the canvas, on touch screens. */
    more: MoreTool;
}

/** Buttons of a toolbar as laid out, see {@link Toolbars.layoutToolbar}. */
interface ToolbarLayout {
    /** Tools of the buttons, from the top, `null` leaving an empty space. */
    slots: Array<Tool | null>;
    /** Tools that do not fit, displayed next to the `More` button while it is toggled. */
    overflow: Tool[];
}

/**
 * Toolbars of the track states, on the sides of the canvas: their tool buttons, the tools of the
 * open groups next to them, and on touch screens the `More` button holding the tools that do not
 * fit the canvas height.
 */
export class Toolbars {
    private toolbars: Toolbar[] = [];
    /** Sides of the toolbars whose tools that do not fit are displayed. */
    private readonly overflowOpen = new Set<ToolbarSide>();
    private track: Track | null = null;

    /**
     * Creates the tools of the toolbars of a state.
     *
     * @returns The tools created, to register.
     */
    public create(track: Track, definitions: ToolbarDefinition[]): Tool[] {
        this.track = track;
        this.toolbars = definitions.map(({ side, tools }) => ({
            side,
            tools: tools.map((toolClass) => (toolClass ? new toolClass(track) : null)),
            more: new MoreTool(
                track,
                () => this.toggleOverflow(side),
                () => this.overflowOpen.has(side),
            ),
        }));
        return this.toolbars.flatMap(({ tools }) => tools.filter((tool) => tool !== null));
    }

    /** Sides of the canvas taken by a toolbar with tools. */
    public get sides(): Set<ToolbarSide> {
        return new Set(
            this.toolbars.filter(({ tools }) => tools.some(Boolean)).map(({ side }) => side),
        );
    }

    /** Whether the tools of a group are displayed, one of them being the current tool. */
    public hasOpenGroup(): boolean {
        return this.toolbars.some(({ tools }) =>
            tools.some((tool) => tool instanceof ToolGroupTool && tool.isActive()),
        );
    }

    /**
     * Number of buttons of each toolbar fitting a canvas height in touch mode, an empty string
     * with a mouse, the toolbars then not depending on the height.
     */
    public fit(height: number, touchMode: boolean): string {
        if (!touchMode) {
            return '';
        }
        return this.toolbars
            .map((toolbar) => this.layoutToolbar(toolbar, true, height).slots.length)
            .join();
    }

    /**
     * Adds the toolbars to the structure of the interface: their buttons, and the tools of the open
     * groups or of the `More` button to `openGroups`, to be added last, over the panels.
     *
     * Each element has the `overlay` class (absolute position) and its own class, whose style
     * positions it from the side of its toolbar.
     *
     * @param height - Height of the canvas in UI pixels, `Infinity` while it is unknown.
     */
    public build(
        touchMode: boolean,
        height: number,
        structure: UIStructureDefinition,
        openGroups: UIStructureDefinition,
        styles: UIStyleDefinition,
    ): void {
        const { toolSize } = uiMetrics();

        // Next to the toolbar from a position, in columns going away from the toolbar when they do
        // not fit in the canvas height
        const pushColumns = (className: string, tools: Tool[], top: number, side: ToolbarSide) => {
            const layout = layoutGroup(tools.length, top, height, toolSize);
            for (let column = 0; column < layout.columns; column++) {
                const columnTools = tools.slice(column * layout.rows, (column + 1) * layout.rows);
                const columnClass = `${className}-${column}`;
                openGroups.push({
                    [`container.overlay.group.${columnClass}`]: columnTools.map((tool) => ({
                        [TOOL_ELEMENT_TYPE]: this.toolElement(tool),
                    })),
                });
                styles[`.${columnClass}`] = {
                    x: toolSize + 4 + column * toolSize,
                    y: layout.top,
                    height: columnTools.length * toolSize,
                    horizontalAlign: side,
                };
            }
        };

        for (const toolbar of this.toolbars) {
            const { side, more } = toolbar;
            const { slots, overflow } = this.layoutToolbar(toolbar, touchMode, height);
            const overflowOpen = overflow.length > 0 && this.overflowOpen.has(side);

            slots.forEach((tool, index) => {
                if (!tool) {
                    return;
                }

                const className = `${side}-${index}`;
                structure.push({
                    [`${TOOL_ELEMENT_TYPE}.overlay.${className}`]: this.toolElement(tool),
                });
                styles[`.${className}`] = { y: index * toolSize, horizontalAlign: side };
            });

            // The tools that do not fit, in place of the open groups of the toolbar, ending at the
            // bottom of the `More` button, the last one
            if (overflowOpen) {
                const top = Math.max(0, (slots.length - overflow.length) * toolSize);
                pushColumns(`${side}-more`, overflow, top, side);
                continue;
            }

            // The tools of a group are displayed while one of them is the current tool, next to
            // the group button, or to the `More` button when it does not fit
            for (const tool of [...slots, ...overflow]) {
                if (tool instanceof ToolGroupTool && tool.isActive()) {
                    const index = slots.includes(tool) ? slots.indexOf(tool) : slots.indexOf(more);
                    const top = index * toolSize;
                    pushColumns(`${side}-${index}-group`, tool.instances, top, side);
                }
            }
        }
    }

    /**
     * Buttons of a toolbar: its tools and empty spaces as defined with a mouse. On touch screens,
     * the empty spaces and the keyboard tools are left out, and the tools that do not fit the
     * canvas height are replaced with the `More` button.
     *
     * @param height - Height of the canvas in UI pixels, `Infinity` while it is unknown.
     */
    private layoutToolbar(
        { tools, more }: Toolbar,
        touchMode: boolean,
        height: number,
    ): ToolbarLayout {
        if (!touchMode) {
            return { slots: tools, overflow: [] };
        }

        const shown = tools.filter(
            (tool): tool is Tool => tool !== null && !tool.toolClass.keyboardOnly,
        );
        const capacity = Math.max(2, Math.floor(height / uiMetrics().toolSize));
        if (shown.length <= capacity) {
            return { slots: shown, overflow: [] };
        }
        return {
            slots: [...shown.slice(0, capacity - 1), more],
            overflow: shown.slice(capacity - 1),
        };
    }

    /** Opens or closes the tools of a toolbar that do not fit, closing the other toolbar's. */
    private toggleOverflow(side: ToolbarSide): void {
        const open = !this.overflowOpen.has(side);
        this.overflowOpen.clear();
        if (open) {
            this.overflowOpen.add(side);
        }
        this.track?.invalidateUI();
    }

    /**
     * Element of a tool button, the tool being read from its data by {@link UIToolButton}. Running
     * a tool closes the tools that do not fit, unless it is the `More` button. A button held long
     * on a touch screen shows its tooltip instead of running its tool.
     */
    private toolElement(tool: Tool) {
        const click = (_x: number, _y: number, button: UIElement) => {
            if (button instanceof UIToolButton && button.heldLong) {
                return;
            }
            if (!(tool instanceof MoreTool) && this.overflowOpen.size > 0) {
                this.overflowOpen.clear();
                this.track?.invalidateUI();
            }
            tool.run();
        };
        return { data: { tool }, events: { click } };
    }
}
