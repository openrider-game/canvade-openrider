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
import { Tool } from '../../../openrider/tool/tool';
import { ToolCollection } from '../../../openrider/tool/tool-collection';
import { TouchControls, TouchInsets } from '../../../openrider/touch/touch-controls';
import type { TrackViewState } from '../track-view.state';
import { ButtonDefinition } from '../track-view.definitions';
import { DebugPanel } from '../ui/debug-panel';
import { ActionsMenu } from '../ui/actions-menu';
import { ControlsPanel } from '../ui/controls-panel';
import { LayersPanel } from '../ui/layers-panel';
import { OptionsDrawer } from '../ui/options-drawer';
import { ToolTooltip } from '../ui/tool-tooltip';
import { Toolbars } from '../ui/toolbars';
import { TOOL_ELEMENT_TYPE } from '../ui/ui-tool-button';
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

/**
 * Top layer of the track states: toolbars with their tooltips, options of the current tool and
 * text buttons, built declaratively with the canvade UI from the definitions of the state.
 *
 * The toolbars are laid out by {@link Toolbars}, the options are in the {@link OptionsDrawer}. States editing the layers of the track also get
 * the {@link LayersPanel}, and states allowing the debug mode get the {@link DebugPanel} while it
 * is enabled.
 *
 * Layers receive the input events top layer first, so this layer syncs the track mouse positions
 * with the canvade `Mouse.worldPos` before the other layers handle the mouse events. A mouse event
 * caught by the interface is marked `consumed` and does not reach the tools of the
 * `TrackMainLayer`.
 */
export class TrackInterfaceLayer extends Layer {
    private readonly toolbars = new Toolbars();
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

        for (const tool of this.toolbars.create(track, this.state.getToolbars())) {
            this.registerTool(tool);
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
            (this.toolbars.hasOpenGroup() ||
                this.toolbars.fit(height, this.builtTouchMode) !==
                    this.toolbars.fit(this.builtHeight, this.builtTouchMode));
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
        const sides = this.toolbars.sides;
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

    /** Buttons of the state held by the {@link ActionsMenu}: none with a mouse. */
    private menuButtons(buttons: ButtonDefinition[]): ButtonDefinition[] {
        return TouchControls.enabled ? ActionsMenu.buttonsOf(buttons) : [];
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

        this.toolbars.build(touchMode, this.builtHeight, structure, openGroups, styles);

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
