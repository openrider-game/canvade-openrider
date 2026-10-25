import {
    Display,
    GameKeyboardEvent,
    Layer,
    Mouse,
    UIElement,
    UIStructureDefinition,
    UIStyleDefinition,
} from 'canvade';
import { ToolGroupTool } from '../../../openrider/tool/group/tool-group.tool';
import { CameraTool } from '../../../openrider/tool/misc/camera.tool';
import { Tool } from '../../../openrider/tool/tool';
import { ToolCollection } from '../../../openrider/tool/tool-collection';
import { TouchControls, TouchInsets } from '../../../openrider/touch/touch-controls';
import type { TrackViewState } from '../track-view.state';
import { ToolbarSide } from '../track-view.definitions';
import { DebugPanel } from '../ui/debug-panel';
import { ControlsPanel } from '../ui/controls-panel';
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
        width: TOOL_SIZE,
        flexDirection: 'column',
    },
};

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
 */
export function layoutGroup(count: number, buttonTop: number, height: number): GroupLayout {
    // A single column while the height is unknown
    const maxRows = Math.max(1, Math.min(count, Math.floor(height / TOOL_SIZE)));
    const columns = Math.ceil(count / maxRows);
    const rows = Math.ceil(count / columns);
    const top = Math.max(0, Math.min(buttonTop, height - rows * TOOL_SIZE));

    return { top, rows, columns };
}

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
    /** Height of the canvas the interface was built for, in UI pixels. */
    private builtHeight = Infinity;
    private readonly optionsDrawer = new OptionsDrawer();
    private readonly layersPanel = new LayersPanel();
    private readonly controlsPanel = new ControlsPanel();
    /** Layout of the touch controls the interface was built with, null without them. */
    private builtTouchControls: string | null = null;

    public constructor(private readonly state: TrackViewState) {
        super();

        // The touch controls above the panel follow it while it slides
        this.layersPanel.onToggle = (duration) => this.moveTouchControls(duration);

        // Handlers subscribed after `super()` run after the canvade UI handlers, so `consumed`
        // tells whether the interface caught the mouse
        this.subscribe('mouseMove', (e) => {
            this.state.track.uiHovered = e.detail.consumed;
        });
        // Clicking the track stops following the bike, not clicking a button, e.g. the one
        // focusing the next ghost
        this.subscribe('mouseDown', (e) => {
            if (!e.detail.consumed) {
                this.state.track.focalPoint = null;
            }
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
        this.subscribe('touchStart', this.revealTouchControls);
        this.subscribe('keyDown', this.handlePanelKey);
    }

    /**
     * Gives the keys to the controls panel while it is open, e.g. the key bound to a control: the
     * keys it takes are consumed, so that they do not trigger the controls.
     */
    private handlePanelKey(e: CustomEvent<GameKeyboardEvent>): void {
        if (this.controlsPanel.handleKey(this.state.track, e.detail.keyboardEvent)) {
            e.detail.consumed = true;
        }
    }

    /** Shows the touch controls from the first touch of the screen, see `TouchControls`. */
    private revealTouchControls(): void {
        TouchControls.enabled = true;
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

    /**
     * Rebuilds the interface when the tools invalidated it (see `Track.invalidateUI`), when the
     * canvas height changed while a group is open, e.g. in fullscreen: the tools of the open
     * groups are laid out after it, or when the touch controls show, hide or move. Rebuilding
     * drops the state of the interface, e.g. the scroll of the layers panel: it is not rebuilt
     * for nothing.
     */
    private refreshInterface(): void {
        const track = this.state.track;
        const resized = this.uiHeight() !== this.builtHeight && this.hasOpenGroup();
        const touchControlsMoved = this.touchControlsLayout() !== this.builtTouchControls;
        if (track.uiInvalidated || resized || touchControlsMoved) {
            track.uiInvalidated = false;
            this.buildInterface();
        }
    }

    /**
     * Layout of the touch controls: the canvas height and the space taken by the interface, null
     * while they are hidden, e.g. before the screen is touched.
     */
    private touchControlsLayout(): string | null {
        if (!TouchControls.enabled || !this.state.showsTouchControls()) {
            return null;
        }
        return JSON.stringify([this.uiHeight(), this.touchInsets()]);
    }

    /**
     * Animates the touch controls to their place for the current space around them, e.g. along
     * with the layers panel sliding, without rebuilding the interface, which would end the
     * animation of the panel.
     */
    private moveTouchControls(duration: number): void {
        if (this.builtTouchControls === null || !this.root) {
            return;
        }

        const { styles } = TouchControls.ui(this.builtHeight, this.touchInsets());
        for (const element of this.root.children) {
            const className = element.classNames.find((name) => `.${name}` in styles);
            const y = className ? styles[`.${className}`].y : undefined;
            if (typeof y === 'number' && y !== element.v('y')) {
                element.animate('y', y, { duration });
            }
        }
        this.builtTouchControls = this.touchControlsLayout();
    }

    /** Space taken by the toolbars, the bottom buttons and the layers panel. */
    private touchInsets(): TouchInsets {
        const sides = new Set(
            this.toolbars.filter(({ tools }) => tools.some(Boolean)).map(({ side }) => side),
        );
        const bottomButtons = this.state
            .getButtons()
            .filter((button) => button.verticalAlign === 'bottom');

        return {
            left: sides.has('left') ? TOOL_SIZE : 0,
            right: sides.has('right') ? TOOL_SIZE : 0,
            bottomLeft: Math.max(0, ...bottomButtons.map((button) => button.y + button.height)),
            bottomRight: this.state.editsLayers()
                ? this.layersPanel.bottomHeight(this.state.track)
                : 0,
        };
    }

    /** Whether the tools of a group are displayed, one of them being the current tool. */
    private hasOpenGroup(): boolean {
        return this.toolbars.some(({ tools }) =>
            tools.some((tool) => tool instanceof ToolGroupTool && tool.isActive()),
        );
    }

    /** Height of the canvas in UI pixels, `Infinity` before the first render. */
    private uiHeight(): number {
        const height = this.state.track.viewHeight;
        return height > 0 ? Math.floor(height / Display.uiScale) : Infinity;
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
        // Added last, drawn over the panels while open
        const openGroups: UIStructureDefinition = [];
        this.builtHeight = this.uiHeight();

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

                // The tools of a group are displayed while one of them is the current tool, in
                // columns going away from the toolbar when they do not fit in the canvas height
                if (tool instanceof ToolGroupTool && tool.isActive()) {
                    const { instances } = tool;
                    const layout = layoutGroup(
                        instances.length,
                        index * TOOL_SIZE,
                        this.builtHeight,
                    );
                    for (let column = 0; column < layout.columns; column++) {
                        const columnTools = instances.slice(
                            column * layout.rows,
                            (column + 1) * layout.rows,
                        );
                        const columnClass = `${className}-group-${column}`;
                        openGroups.push({
                            [`container.overlay.group.${columnClass}`]: columnTools.map(
                                (instance) => ({
                                    [TOOL_ELEMENT_TYPE]: this.toolElement(instance),
                                }),
                            ),
                        });
                        styles[`.${columnClass}`] = {
                            x: GROUP_OFFSET + column * TOOL_SIZE,
                            y: layout.top,
                            height: columnTools.length * TOOL_SIZE,
                            horizontalAlign: side,
                        };
                    }
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
        this.builtTouchControls = this.touchControlsLayout();
        if (this.builtTouchControls !== null) {
            const touch = TouchControls.ui(this.builtHeight, this.touchInsets());
            structure.push(...touch.structure);
            Object.assign(styles, touch.styles);
        }
        structure.push(...openGroups);
        // Over everything else while open
        const controlsOpen = this.state.track.controlsOpen;

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

        if (controlsOpen) {
            this.controlsPanel.build(this.state.track, structure, styles, this.builtHeight);
        }

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
    }

    private clearHover(): void {
        this.root?.setHoveredElement(null);
        this.state.track.uiHovered = false;
    }
}
