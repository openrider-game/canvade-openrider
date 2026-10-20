import { Layer, Mouse, UIElement, UIStructureDefinition, UIStyleDefinition } from 'canvade';
import { ToolGroupTool } from '../../../openrider/tool/group/tool-group.tool';
import { CameraTool } from '../../../openrider/tool/misc/camera.tool';
import { Tool } from '../../../openrider/tool/tool';
import { ToolCollection } from '../../../openrider/tool/tool-collection';
import type { TrackViewState } from '../track-view.state';
import { ToolbarSide } from '../track-view.definitions';
import { DebugPanel } from '../ui/debug-panel';
import { LayersPanel } from '../ui/layers-panel';
import { OptionsDrawer } from '../ui/options-drawer';
import { ToolTooltip } from '../ui/tool-tooltip';
import { TOOL_ELEMENT_TYPE } from '../ui/ui-tool-button';
import {
    THEME_STYLES,
    UI_ACTIVE_BACKGROUND_COLOR,
    UI_BACKGROUND_COLOR,
    UI_HOVER_BACKGROUND_COLOR,
} from '../ui/ui-theme';

const TOOL_SIZE = 26,
    // Offset of the tools of an open group from the canvas edge, next to their toolbar
    GROUP_OFFSET = 30;

/** Styles of every interface, completed with the positions computed when it is built. */
const BASE_STYLES: UIStyleDefinition = {
    ...THEME_STYLES,
    [TOOL_ELEMENT_TYPE]: {
        width: TOOL_SIZE,
        height: TOOL_SIZE,
        backgroundColor: UI_BACKGROUND_COLOR,
        hoverBackgroundColor: UI_HOVER_BACKGROUND_COLOR,
        activeBackgroundColor: UI_ACTIVE_BACKGROUND_COLOR,
    },
    // Every top level element is laid out over the track, outside of the root flow
    '.overlay': {
        position: 'absolute',
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
 * Top layer of the track states: toolbars with their tooltips, options of the current tool and
 * text buttons, built declaratively with the canvade UI from the definitions of the state.
 *
 * The options are in the {@link OptionsDrawer}. States editing the layers of the track also get
 * the {@link LayersPanel}, and states allowing the debug mode get the {@link DebugPanel} while it
 * is enabled.
 *
 * Layers receive the input events top layer first, so this layer syncs the track mouse positions
 * with the canvade `Mouse.worldPos` before the other layers handle the mouse events. A mouse event
 * caught by the interface is marked `consumed` and does not reach the tools of the
 * `TrackMainLayer`.
 */
export class TrackInterfaceLayer extends Layer {
    private toolbars: Toolbar[] = [];
    private root: UIElement | null = null;
    private readonly optionsDrawer = new OptionsDrawer();
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

        this.optionsDrawer.build(this.state.track, structure, styles);
        if (this.state.editsLayers()) {
            this.layersPanel.build(this.state.track, structure, styles);
        }
        if (this.state.allowsDebug() && this.state.track.debug) {
            DebugPanel.build(this.state.track, structure, styles);
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

        const root = this.uiRenderer.setUI(structure, styles);
        this.root = root;
        // Rendered once the whole UI tree is, so that the tooltip is drawn over the toolbars
        root.subscribe('renderTree', (e) => ToolTooltip.render(e.detail.ctx, root));
    }

    /** Element of a tool button, the tool being read from its data by {@link UIToolButton}. */
    private toolElement(tool: Tool) {
        return { data: { tool }, events: { click: () => tool.run() } };
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
