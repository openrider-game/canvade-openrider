import {
    Display,
    GameKeyboardEvent,
    GamePointerEvent,
    Layer,
    Mouse,
    UIElement,
    UIStructureDefinition,
    UIStyleDefinition,
} from 'canvade';
import { ToolGroupTool } from '../../../openrider/tool/group/tool-group.tool';
import { CameraTool } from '../../../openrider/tool/misc/camera.tool';
import { MoreTool } from '../../../openrider/tool/misc/more.tool';
import { Tool } from '../../../openrider/tool/tool';
import { ToolCollection } from '../../../openrider/tool/tool-collection';
import { TouchControls, TouchInsets } from '../../../openrider/touch/touch-controls';
import type { TrackViewState } from '../track-view.state';
import { ButtonDefinition, ToolbarSide } from '../track-view.definitions';
import { DebugPanel } from '../ui/debug-panel';
import { ActionsMenu } from '../ui/actions-menu';
import { ControlsPanel } from '../ui/controls-panel';
import { LayersPanel } from '../ui/layers-panel';
import { OptionsDrawer } from '../ui/options-drawer';
import { ToolTooltip } from '../ui/tool-tooltip';
import { TOOL_ELEMENT_TYPE, UIToolButton } from '../ui/ui-tool-button';
// Registers the riding buttons element
import '../ui/ui-touch-button';
import {
    themeStyles,
    UI_ACTIVE_BACKGROUND_COLOR,
    UI_BACKGROUND_COLOR,
    UI_HOVER_BACKGROUND_COLOR,
    uiMetrics,
} from '../ui/ui-theme';

/**
 * Styles of every interface for the current metrics, completed with the positions computed when
 * it is built.
 */
function baseStyles(toolSize: number): UIStyleDefinition {
    return {
        ...themeStyles(),
        [TOOL_ELEMENT_TYPE]: {
            width: toolSize,
            height: toolSize,
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
            width: toolSize,
            flexDirection: 'column',
        },
    };
}

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

/** Buttons of a toolbar as laid out, see {@link TrackInterfaceLayer.layoutToolbar}. */
interface ToolbarLayout {
    /** Tools of the buttons, from the top, `null` leaving an empty space. */
    slots: Array<Tool | null>;
    /** Tools that do not fit, displayed next to the `More` button while it is toggled. */
    overflow: Tool[];
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
    private readonly actionsMenu = new ActionsMenu();
    /** Layout of the touch controls the interface was built with, null without them. */
    private builtTouchControls: string | null = null;
    /** Whether the interface was built in touch mode, with its larger sizes. */
    private builtTouchMode = false;
    /** Sides of the toolbars whose tools that do not fit are displayed. */
    private readonly overflowOpen = new Set<ToolbarSide>();

    public constructor(private readonly state: TrackViewState) {
        super();

        // The touch controls above the panels follow them while they slide
        this.layersPanel.onToggle = (duration) => this.moveTouchControls(duration);
        this.actionsMenu.onToggle = (duration) => this.moveTouchControls(duration);

        // Handlers subscribed after `super()` run after the canvade UI handlers, so `consumed`
        // tells whether the interface caught the mouse
        this.subscribe('pointerMove', (e) => {
            if (e.detail.primary) {
                this.state.track.uiHovered = e.detail.consumed;
            }
        });
        // Clicking the track stops following the bike, not clicking a button, e.g. the one
        // focusing the next ghost
        this.subscribe('pointerDown', (e) => {
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
        this.subscribe('pointerDown', this.syncPointerDown);
        this.subscribe('pointerMove', this.syncPointer);
        this.subscribe('pointerUp', this.syncPointer);
        this.subscribe('pointerLeave', this.clearHover);
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

    /** Creates the tools of the state toolbars, the camera being the default tool. */
    private createTools(): void {
        const track = this.state.track;
        track.toolCollection = new ToolCollection();

        this.toolbars = this.state.getToolbars().map(({ side, tools }) => ({
            side,
            tools: tools.map((toolClass) => (toolClass ? new toolClass(track) : null)),
            more: new MoreTool(
                track,
                () => this.toggleOverflow(side),
                () => this.overflowOpen.has(side),
            ),
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
     * groups are laid out after it, when the touch controls show, hide or move, or when the touch
     * mode changes the sizes of the interface (see `uiMetrics`). Rebuilding
     * drops the state of the interface, e.g. the scroll of the layers panel: it is not rebuilt
     * for nothing.
     */
    private refreshInterface(): void {
        const track = this.state.track;
        const height = this.uiHeight();
        // The toolbars of touch screens fit the canvas height too
        const resized =
            height !== this.builtHeight &&
            (this.hasOpenGroup() ||
                this.toolbarsFit(height) !== this.toolbarsFit(this.builtHeight));
        const touchControlsMoved = this.touchControlsLayout() !== this.builtTouchControls;
        const touchModeChanged = TouchControls.enabled !== this.builtTouchMode;
        if (track.uiInvalidated || resized || touchControlsMoved || touchModeChanged) {
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
        const buttons = this.state.getButtons();
        const bottomButtons = buttons.filter((button) => button.verticalAlign === 'bottom');
        const menuButtons = this.menuButtons(buttons);
        const { toolSize, actionHeight } = uiMetrics();

        return {
            left: sides.has('left') ? toolSize : 0,
            right: sides.has('right') ? toolSize : 0,
            bottomLeft: menuButtons.length
                ? this.actionsMenu.bottomHeight(menuButtons.length)
                : Math.max(
                      0,
                      ...bottomButtons.map(
                          (button) => button.y + Math.max(button.height, actionHeight),
                      ),
                  ),
            bottomRight: this.state.editsLayers()
                ? this.layersPanel.bottomHeight(this.state.track)
                : 0,
        };
    }

    /**
     * Number of buttons of each toolbar fitting a canvas height in touch mode, an empty string
     * with a mouse, the toolbars then not depending on the height.
     */
    private toolbarsFit(height: number): string {
        if (!this.builtTouchMode) {
            return '';
        }
        return this.toolbars
            .map((toolbar) => this.layoutToolbar(toolbar, true, height).slots.length)
            .join();
    }

    /** Buttons of the state held by the {@link ActionsMenu}: none with a mouse. */
    private menuButtons(buttons: ButtonDefinition[]): ButtonDefinition[] {
        return TouchControls.enabled ? ActionsMenu.buttonsOf(buttons) : [];
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
        const touchMode = TouchControls.enabled;
        const { toolSize, actionHeight } = uiMetrics();
        const structure: UIStructureDefinition = [];
        const styles: UIStyleDefinition = baseStyles(toolSize);
        // Added last, drawn over the panels while open
        const openGroups: UIStructureDefinition = [];
        this.builtHeight = this.uiHeight();
        this.builtTouchMode = touchMode;

        // Next to the toolbar from a position, in columns going away from the toolbar when they do
        // not fit in the canvas height
        const pushColumns = (className: string, tools: Tool[], top: number, side: ToolbarSide) => {
            const layout = layoutGroup(tools.length, top, this.builtHeight, toolSize);
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

        // Toolbars, along with the tools of the open groups
        for (const toolbar of this.toolbars) {
            const { side, more } = toolbar;
            const { slots, overflow } = this.layoutToolbar(toolbar, touchMode, this.builtHeight);
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
        // Over everything else while open
        const controlsOpen = this.state.track.controlsOpen;

        // State buttons, the ones at the bottom left in a menu on touch screens
        const buttons = this.state.getButtons();
        const menuButtons = this.menuButtons(buttons);
        if (menuButtons.length) {
            this.actionsMenu.build(menuButtons, this.touchInsets().left + 10, structure, styles);
        }
        buttons.forEach((button, index) => {
            if (menuButtons.includes(button)) {
                return;
            }
            structure.push({
                [`button.overlay.action-${index}`]: { events: { click: () => button.action() } },
            });
            styles[`.action-${index}`] = {
                x: button.x,
                y: button.y,
                width: button.width,
                height: Math.max(button.height, actionHeight),
                horizontalAlign: button.horizontalAlign ?? 'left',
                verticalAlign: button.verticalAlign ?? 'top',
                text: button.label,
            };
        });

        structure.push(...openGroups);
        if (controlsOpen) {
            this.controlsPanel.build(this.state.track, structure, styles, this.builtHeight);
        }

        const root = this.uiRenderer.setUI(structure, styles);
        this.root = root;
        // Rendered once the whole UI tree is, so that the tooltip is drawn over the toolbars
        root.subscribe('renderTree', (e) => ToolTooltip.render(e.detail.ctx, root));
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
        this.state.track.invalidateUI();
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
                this.state.track.invalidateUI();
            }
            tool.run();
        };
        return { data: { tool }, events: { click } };
    }

    /** Follows the primary pointer, the one `Mouse` follows. */
    private syncPointer(e: CustomEvent<GamePointerEvent>): void {
        if (e.detail.primary) {
            this.state.track.setMousePosition(Mouse.worldPos);
        }
    }

    /**
     * Records the click of the primary pointer, and follows the type of the pointer for the touch
     * mode, see `TouchControls`.
     */
    private syncPointerDown(e: CustomEvent<GamePointerEvent>): void {
        TouchControls.follow(e.detail.pointerEvent.pointerType);
        if (e.detail.primary) {
            const track = this.state.track;
            track.setMousePosition(Mouse.worldPos);
            track.lastClick.set(track.mousePos);
        }
    }

    private clearHover(): void {
        this.root?.setHoveredElement(null);
        this.state.track.uiHovered = false;
    }
}
