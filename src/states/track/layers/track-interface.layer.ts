import {
    GameRenderEvent,
    Layer,
    Mouse,
    UIButton,
    UIElement,
    UIStructureDefinition,
    UIStyleDefinition,
} from 'canvade';
import { ToolGroupTool } from '../../../openrider/tool/group/tool-group.tool';
import { CameraTool } from '../../../openrider/tool/misc/camera.tool';
import { Tool } from '../../../openrider/tool/tool';
import { ToolCollection } from '../../../openrider/tool/tool-collection';
import type { TrackViewState } from '../track-view.state';
import { ToolbarSide } from '../track-view.definitions';
import { LayersPanel } from '../ui/layers-panel';
import { TOOL_ELEMENT_TYPE, UIToolButton } from '../ui/ui-tool-button';

const TOOL_SIZE = 26,
    // Offset of the tools of an open group from the canvas edge, next to their toolbar
    GROUP_OFFSET = 30,
    OPTION_WIDTH = 300,
    OPTION_HEIGHT = 30,
    OPTION_GAP = 5,
    HANDLE_WIDTH = 90,
    HANDLE_HEIGHT = 20,
    DRAWER_DURATION = 250,
    DRAWER_OPEN_LABEL = 'Options ▲',
    DRAWER_CLOSED_LABEL = 'Options ▼',
    TOOLTIP_MARGIN = 4;

/** Styles of every interface, completed with the positions computed when it is built. */
const BASE_STYLES: UIStyleDefinition = {
    button: {
        backgroundColor: '#fff',
        hoverBackgroundColor: '#ddd',
        focusBackgroundColor: '#fff',
        activeBackgroundColor: '#ccc',
        color: '#000',
    },
    [TOOL_ELEMENT_TYPE]: {
        width: TOOL_SIZE,
        height: TOOL_SIZE,
        backgroundColor: '#fff',
        hoverBackgroundColor: '#ddd',
        activeBackgroundColor: '#ccc',
    },
    container: {
        color: 'transparent',
    },
    // Every top level element is laid out over the track, outside of the root flow
    '.overlay': {
        position: 'absolute',
    },
    // Only laying the buttons out: the track stays reachable between them
    '.options': {
        pointerEvents: 'none',
        horizontalAlign: 'center',
        y: OPTION_GAP,
        width: OPTION_WIDTH,
        gap: OPTION_GAP,
        flexDirection: 'column',
    },
    '.options button': {
        width: '100%',
        height: OPTION_HEIGHT,
    },
    '.options-handle': {
        horizontalAlign: 'center',
        width: HANDLE_WIDTH,
        height: HANDLE_HEIGHT,
    },
    '.group': {
        pointerEvents: 'none',
        x: GROUP_OFFSET,
        width: TOOL_SIZE,
        flexDirection: 'column',
    },
};

/** Toolbar with the tools created when entering the state. */
interface Toolbar {
    side: ToolbarSide;
    tools: Array<Tool | null>;
}

/**
 * Top layer of the track states: toolbars, options of the current tool and text buttons, built
 * declaratively with the canvade UI from the definitions of the state.
 *
 * The options are in a drawer at the top of the canvas, hidden above it until its handle button
 * opens it. The drawer stays open or closed when the current tool changes. States editing the
 * layers of the track also get the {@link LayersPanel}.
 *
 * Layers receive the input events top layer first, so this layer syncs the track mouse positions
 * with the canvade `Mouse.worldPos` before the other layers handle the mouse events. A mouse event
 * caught by the interface is marked `consumed` and does not reach the tools of the
 * `TrackMainLayer`.
 */
export class TrackInterfaceLayer extends Layer {
    private toolbars: Toolbar[] = [];
    private root: UIElement | null = null;
    private optionsDrawerOpen = false;
    private readonly layersPanel = new LayersPanel();

    public constructor(private readonly state: TrackViewState) {
        super();

        // Handlers subscribed after `super()` run after the canvade UI handlers, so `consumed`
        // tells whether the interface caught the mouse
        this.subscribe('mouseMove', (e) => {
            this.state.track.uiHovered = e.detail.consumed;
        });
    }

    public initLayer(): void {
        // Called by the Layer constructor, before `state` is assigned: only subscribe here. These
        // handlers run before the canvade UI handlers.
        this.subscribe('enter', this.createTools);
        this.subscribe('update', this.refreshInterface);
        this.subscribe('mouseDown', this.syncMouseDown);
        this.subscribe('mouseMove', this.syncMouse);
        this.subscribe('mouseUp', this.syncMouse);
        this.subscribe('mouseOut', this.clearHover);
    }

    /** Creates the tools of the state toolbars, the camera being the default tool. */
    private createTools(): void {
        const track = this.state.track;
        track.toolCollection = new ToolCollection();

        this.toolbars = this.state.getToolbars().map(({ side, tools }) => ({
            side,
            tools: tools.map((toolClass) => (toolClass ? new toolClass(track) : null)),
        }));

        for (const toolbar of this.toolbars) {
            for (const tool of toolbar.tools) {
                if (tool) {
                    this.registerTool(tool);
                }
            }
        }

        const cameraTool = track.toolCollection.getByToolName(CameraTool.toolName) ?? null;
        track.toolManager.setCamera(cameraTool);
        if (cameraTool) {
            track.toolManager.setTool(cameraTool);
        }

        this.buildInterface();
    }

    private registerTool(tool: Tool): void {
        tool.registerControls();
        this.state.track.toolCollection.add(tool);

        if (tool instanceof ToolGroupTool) {
            tool.instances.forEach((instance) => this.state.track.toolCollection.add(instance));
        }
    }

    /** Rebuilds the interface when the tools invalidated it (see `Track.invalidateUI`). */
    private refreshInterface(): void {
        const track = this.state.track;
        if (track.uiInvalidated) {
            track.uiInvalidated = false;
            this.buildInterface();
        }
    }

    /**
     * Replaces the UI of the layer with the current toolbars, options and buttons.
     *
     * Each top level element has the `overlay` class (absolute position) and its own class,
     * whose style positions it from the aligned edges of the canvas.
     */
    private buildInterface(): void {
        const structure: UIStructureDefinition = [];
        const styles: UIStyleDefinition = { ...BASE_STYLES };

        // Toolbars, along with the tools of the open groups
        for (const { side, tools } of this.toolbars) {
            tools.forEach((tool, index) => {
                if (!tool) {
                    return;
                }

                const className = `${side}-${index}`;
                structure.push({
                    [`${TOOL_ELEMENT_TYPE}.overlay.${className}`]: this.toolElement(tool),
                });
                styles[`.${className}`] = { y: index * TOOL_SIZE, horizontalAlign: side };

                // The tools of a group are displayed while one of them is the current tool
                if (tool instanceof ToolGroupTool && tool.isActive()) {
                    structure.push({
                        [`container.overlay.group.${className}-group`]: tool.instances.map(
                            (instance) => ({
                                [TOOL_ELEMENT_TYPE]: this.toolElement(instance),
                            }),
                        ),
                    });
                    styles[`.${className}-group`] = {
                        y: index * TOOL_SIZE,
                        height: tool.instances.length * TOOL_SIZE,
                        horizontalAlign: side,
                    };
                }
            });
        }

        // Drawer with the options of the current tool, and its handle
        const options = this.state.track.toolManager.tool?.getOptions() ?? [];
        if (options.length) {
            const height = options.length * (OPTION_HEIGHT + OPTION_GAP);
            structure.push({
                'container.overlay.options': options.map((option, index) => ({
                    [`button.option-${index}`]: { events: { click: () => option.action() } },
                })),
            });
            structure.push({
                'button.overlay.options-handle': {
                    events: { click: () => this.toggleOptionsDrawer() },
                },
            });
            styles['.options'] = {
                ...BASE_STYLES['.options'],
                y: this.drawerOffsets(height).options,
                height,
            };
            styles['.options-handle'] = {
                ...BASE_STYLES['.options-handle'],
                y: this.drawerOffsets(height).handle,
                text: this.optionsDrawerOpen ? DRAWER_OPEN_LABEL : DRAWER_CLOSED_LABEL,
            };
            options.forEach((option, index) => {
                styles[`.option-${index}`] = { text: option.label };
            });
        }

        if (this.state.editsLayers()) {
            this.layersPanel.build(this.state.track, structure, styles);
        }

        // State buttons
        this.state.getButtons().forEach((button, index) => {
            structure.push({
                [`button.overlay.action-${index}`]: { events: { click: () => button.action() } },
            });
            styles[`.action-${index}`] = {
                x: button.x,
                y: button.y,
                width: button.width,
                height: button.height,
                horizontalAlign: button.horizontalAlign ?? 'left',
                verticalAlign: button.verticalAlign ?? 'top',
                text: button.label,
            };
        });

        this.root = this.uiRenderer.setUI(structure, styles);
        // Rendered once the whole UI tree is, so that the tooltip is drawn over the toolbars
        this.root.subscribe('renderTree', (e) => this.renderTooltip(e));
    }

    /**
     * Opens or closes the options drawer, sliding the options and the handle together.
     *
     * The interface is not rebuilt: a rebuild during the animation applies its end position.
     */
    public toggleOptionsDrawer(): void {
        this.optionsDrawerOpen = !this.optionsDrawerOpen;

        const options = this.root?.children.find((child) => child.classNames.includes('options'));
        const handle = this.root?.children.find((child) =>
            child.classNames.includes('options-handle'),
        );
        if (!options || !(handle instanceof UIButton)) {
            return;
        }

        const offsets = this.drawerOffsets(options.v('height'));
        options.animate('y', offsets.options, { duration: DRAWER_DURATION });
        handle.animate('y', offsets.handle, { duration: DRAWER_DURATION });
        handle
            .getProperty('text')
            .setValue(this.optionsDrawerOpen ? DRAWER_OPEN_LABEL : DRAWER_CLOSED_LABEL);
    }

    /**
     * Vertical offsets of the options and of the handle: a closed drawer is right above the
     * canvas, with the handle at its top edge.
     *
     * @param height - Height of the options container.
     */
    private drawerOffsets(height: number): { options: number; handle: number } {
        return this.optionsDrawerOpen
            ? { options: OPTION_GAP, handle: OPTION_GAP + height }
            : { options: -height, handle: 0 };
    }

    /** Element of a tool button, the tool being read from its data by {@link UIToolButton}. */
    private toolElement(tool: Tool) {
        return { data: { tool }, events: { click: () => tool.run() } };
    }

    /** Displays the name and shortcut of the hovered tool next to its button. */
    private renderTooltip(e: CustomEvent<GameRenderEvent>): void {
        const hovered = this.root ? this.findHoveredTool(this.root) : null;
        const tool = hovered?.tool;
        if (!hovered || !tool) {
            return;
        }

        const ctx = e.detail.ctx;
        const { x, y, width } = hovered.getBounds();
        const keyLabel = tool.toolClass.keyLabel;
        const label = keyLabel ? `${tool.getLabel()} (${keyLabel})` : tool.getLabel();

        ctx.save();
        const metrics = ctx.measureText(label);
        const labelHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

        // Tooltips of the right toolbar are displayed on the left of the buttons
        let rectX = x + width + TOOLTIP_MARGIN;
        if (this.root && x > this.root.getBounds().width / 2) {
            rectX = x - 2 * TOOLTIP_MARGIN - metrics.width;
        }

        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(rectX, y + 1, metrics.width + TOOLTIP_MARGIN, TOOL_SIZE - 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.fillText(label, rectX + TOOLTIP_MARGIN / 2, y + labelHeight + 5);
        ctx.restore();
    }

    private findHoveredTool(element: UIElement): UIToolButton | null {
        if (element instanceof UIToolButton && element.isHovered()) {
            return element;
        }

        for (const child of element.children) {
            const hovered = this.findHoveredTool(child);
            if (hovered) {
                return hovered;
            }
        }

        return null;
    }

    private syncMouse(): void {
        this.state.track.setMousePosition(Mouse.worldPos);
    }

    private syncMouseDown(): void {
        const track = this.state.track;
        track.setMousePosition(Mouse.worldPos);
        track.lastClick.set(track.mousePos);
        // Clicking stops following the bike
        track.focalPoint = null;
    }

    private clearHover(): void {
        this.root?.setHoveredElement(null);
        this.state.track.uiHovered = false;
    }
}
