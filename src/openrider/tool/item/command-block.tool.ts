import { Control, KEYA, SHIFT, Vector } from 'canvade';
import { GAME_UPS } from '../../constants/game.constants';
import {
    COMMAND_KINDS,
    CommandArea,
    CommandBlock,
    CommandKind,
    CommandSettings,
    defaultCommandSettings,
} from '../../item/command/command-block';
import type { Item } from '../../item/item';
import { ToolOption } from '../tool';
import { COMMAND_BLOCK_ICON } from '../tool-icons';
import { ItemTool } from './item.tool';

/** Labels of the commands in the options. */
const COMMAND_LABELS: Record<CommandKind, string> = {
    zoom: 'zoom',
    camera: 'show a point',
    hide: 'open (hide area)',
    show: 'show area',
    move: 'move area',
};

/** Zooms and durations (in seconds) the options cycle through. */
const ZOOMS = [0.4, 0.6, 1, 1.5, 2],
    DURATIONS = [0.5, 1, 2, 4, 8];

/** Areas smaller than this, in world units, are taken for a click and ignored. */
const MIN_AREA_SIZE = 10;

/** Step of the placement of a command block, see {@link CommandBlockTool}. */
type Step = 'block' | 'area' | 'target';

/**
 * Places a command block, in steps depending on its command: click its position, then drag the
 * area it acts on (open, show, move), then click where the center of the area moves to (move),
 * or click the point it shows (camera). The options choose the command, its zoom and its
 * duration, and tell the next step.
 */
export class CommandBlockTool extends ItemTool {
    public static override readonly toolName: string = 'Command Block';
    public static override readonly key = new Control(KEYA, SHIFT);
    public static override readonly icon = COMMAND_BLOCK_ICON;

    /** Settings of the next block. */
    private settings = defaultCommandSettings();
    private step: Step = 'block';
    private blockPos: Vector | null = null;
    /** Corner of the area being dragged, null while not dragging. */
    private areaStart: Vector | null = null;

    protected get itemClass(): { readonly color: string } {
        return CommandBlock;
    }

    protected createItem(pos: Vector): Item {
        const settings: CommandSettings = {
            ...this.settings,
            area: this.settings.area && { ...this.settings.area },
            offset: this.settings.offset.clone(),
            target: this.settings.target.clone(),
        };
        return new CommandBlock(pos, settings, this.track);
    }

    public override deactivate(): void {
        super.deactivate();
        this.restart();
    }

    public override onMouseDown(): void {
        // Only called for the left button, the right one being the camera's
        this.mouseDown = true;
        if (this.step === 'area') {
            this.areaStart = this.track.mousePos.clone();
        }
    }

    public override onMouseUp(): void {
        // Released after dragging the camera with the right button
        if (!this.mouseDown) {
            return;
        }
        this.mouseDown = false;

        const mousePos = this.track.mousePos.clone();
        const kind = this.settings.kind;

        if (this.step === 'block') {
            this.blockPos = mousePos;
            if (kind === 'zoom') {
                this.placeBlock();
            } else {
                this.setStep(kind === 'camera' ? 'target' : 'area');
            }
        } else if (this.step === 'area') {
            const area = this.areaStart && CommandBlockTool.area(this.areaStart, mousePos);
            this.areaStart = null;
            if (!area) {
                return;
            }
            this.settings.area = area;
            if (kind === 'move') {
                this.setStep('target');
            } else {
                this.placeBlock();
            }
        } else if (kind === 'camera') {
            this.settings.target = mousePos;
            this.placeBlock();
        } else {
            this.settings.offset = mousePos.sub(CommandBlockTool.center(this.settings.area));
            this.placeBlock();
        }
    }

    private placeBlock(): void {
        if (this.blockPos) {
            this.place(this.createItem(this.blockPos));
        }
        this.restart();
    }

    /** Starts placing a new block, keeping the command and its zoom and duration. */
    private restart(): void {
        this.blockPos = null;
        this.areaStart = null;
        this.settings.area = null;
        this.settings.offset = new Vector();
        this.settings.target = new Vector();
        this.setStep('block');
    }

    private setStep(step: Step): void {
        this.step = step;
        // The options tell the next step
        this.track.invalidateUI();
    }

    public override getOptions(): ToolOption[] {
        const { kind, zoom, duration } = this.settings;
        const cycle = <T>(values: T[], value: T) =>
            values[(values.indexOf(value) + 1) % values.length];
        const options: ToolOption[] = [
            {
                label: `Command: ${COMMAND_LABELS[kind]}`,
                action: () => {
                    this.settings.kind = cycle([...COMMAND_KINDS], kind);
                    this.restart();
                },
            },
        ];

        if (kind === 'zoom') {
            options.push({
                label: `Zoom: ${zoom}`,
                action: () => {
                    this.settings.zoom = cycle(ZOOMS, zoom);
                    this.track.invalidateUI();
                },
            });
        }
        if (kind === 'camera' || kind === 'move') {
            const seconds = duration / GAME_UPS;
            options.push({
                label: `Duration: ${seconds} s`,
                action: () => {
                    this.settings.duration = cycle(DURATIONS, seconds) * GAME_UPS;
                    this.track.invalidateUI();
                },
            });
        }

        options.push({ label: `Next: ${this.nextStep()}`, action: () => this.restart() });
        return options;
    }

    /** What the next click does, also restarting the block when clicked in the options. */
    private nextStep(): string {
        if (this.step === 'block') {
            return 'click the block position';
        }
        if (this.step === 'area') {
            return 'drag the area to act on';
        }
        return this.settings.kind === 'camera'
            ? 'click the point to show'
            : 'click where the area moves';
    }

    /**
     * Draws the block following the mouse, then once placed what it acts on so far, with a
     * crosshair at the mouse.
     */
    public override render(ctx: CanvasRenderingContext2D): void {
        const mousePos = this.track.mousePos;
        const mousePx = this.track.toPixel(mousePos);
        if (!this.blockPos) {
            this.renderPreview(ctx, mousePx);
            return;
        }

        CommandBlock.renderSettings(ctx, this.track, this.blockPos, this.preview(mousePos));
        this.renderPreview(ctx, this.track.toPixel(this.blockPos));

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mousePx.x - 10, mousePx.y);
        ctx.lineTo(mousePx.x + 10, mousePx.y);
        ctx.moveTo(mousePx.x, mousePx.y - 10);
        ctx.lineTo(mousePx.x, mousePx.y + 10);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Settings of the block being placed as far as chosen, the mouse giving the current step:
     * never the offset or point of the previous block.
     */
    private preview(mousePos: Vector): CommandSettings {
        const { kind, area } = this.settings;
        const preview = defaultCommandSettings(kind);

        if (this.step === 'area') {
            // The area being dragged, not moved yet
            preview.kind = 'hide';
            preview.area = this.areaStart && CommandBlockTool.area(this.areaStart, mousePos, 0);
        } else if (kind === 'camera') {
            preview.target = mousePos;
        } else {
            preview.area = area;
            preview.offset = mousePos.sub(CommandBlockTool.center(area));
        }
        return preview;
    }

    protected override renderPreview(ctx: CanvasRenderingContext2D, pos: Vector): void {
        const size = 8 * this.track.zoomFactor;
        ctx.fillStyle = this.itemClass.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2 * this.track.zoomFactor, 0.5);
        ctx.fillRect(pos.x - size, pos.y - size, 2 * size, 2 * size);
        ctx.strokeRect(pos.x - size, pos.y - size, 2 * size, 2 * size);
    }

    /** Area between two corners, null when smaller than `minSize` on a side. */
    private static area(from: Vector, to: Vector, minSize = MIN_AREA_SIZE): CommandArea | null {
        const area = {
            left: Math.min(from.x, to.x),
            top: Math.min(from.y, to.y),
            right: Math.max(from.x, to.x),
            bottom: Math.max(from.y, to.y),
        };
        return area.right - area.left < minSize || area.bottom - area.top < minSize ? null : area;
    }

    private static center(area: CommandArea | null): Vector {
        return area
            ? new Vector((area.left + area.right) / 2, (area.top + area.bottom) / 2)
            : new Vector();
    }
}
