import { Vector } from 'canvade';
import type { BikeRunner } from '../../bike/runner/bike-runner';
import type { Collidable } from '../../entity/collidable';
import type { Track } from '../../track/track';
import { Item, parseItemPosition } from '../item';

/**
 * Commands of the blocks, in the order of their code in the track codes:
 *
 * - `zoom`: eases the view of the player to a zoom;
 * - `camera`: shows a point of the track to the player for a while, then follows the bike again;
 * - `hide`: the objects of the area disappear, e.g. a door opening;
 * - `show`: the objects of the area appear, e.g. a bridge;
 * - `move`: the objects of the area slide by an offset, e.g. a sliding door or an elevator.
 */
export const COMMAND_KINDS = ['zoom', 'camera', 'hide', 'show', 'move'] as const;

export type CommandKind = (typeof COMMAND_KINDS)[number];

/** Rectangle of the objects a command acts on, in world units. */
export interface CommandArea {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Settings of a command block, the ones of other commands being ignored. */
export interface CommandSettings {
    kind: CommandKind;
    /** `hide`, `show` and `move`: objects acted on, the ones fully inside it on the layer. */
    area: CommandArea | null;
    /** `move`: offset of the objects once moved. */
    offset: Vector;
    /** `camera`: point shown. */
    target: Vector;
    /** `camera` and `move`: duration, in physics ticks. */
    duration: number;
    /** `zoom`: view zoom, as the zoom levels of the player. */
    zoom: number;
}

/** Settings of a new command block. */
export function defaultCommandSettings(kind: CommandKind = 'hide'): CommandSettings {
    return {
        kind,
        area: null,
        offset: new Vector(),
        target: new Vector(),
        duration: 50,
        zoom: 1,
    };
}

/** Offset of the objects of the blocks not moving them, never modified. */
const NO_OFFSET = Object.freeze(new Vector());

/**
 * Item triggering a command when a bike touches it, once per run: controlling the view of the
 * player, or hiding, showing or moving the objects of an area of its layer, as doors, bridges or
 * elevators.
 *
 * The objects of the area depend on the runners: a door is open for the bikes that touched the
 * block only, so that the ghosts replay their runs whatever the player does. Each runner keeps
 * the tick it triggered each block at (`BikeRunner.commandTimes`), saved in its checkpoints. The
 * view commands only follow the player.
 *
 * Track code: `A x y <kind> <settings>`, the kind being its index in {@link COMMAND_KINDS} and the
 * settings integers in base 32: `zoom` its zoom times 100, `camera` the point and the duration,
 * `hide` and `show` the area (left, top, right, bottom), `move` the area, the offset and the
 * duration.
 */
export class CommandBlock extends Item {
    public static override readonly itemName: string = 'Command Block';
    public static override readonly color: string = '#555';
    public static override readonly code: string = 'A';

    public constructor(
        pos: Vector,
        public readonly settings: CommandSettings,
        track: Track,
    ) {
        super(pos, track);
    }

    /** Whether the command acts on the objects of an area. */
    public get actsOnArea(): boolean {
        return ['hide', 'show', 'move'].includes(this.settings.kind);
    }

    protected override onTouch(part: Collidable): void {
        const runner = part.bike.runner;
        if (runner.commandTimes.has(this.id)) {
            return;
        }

        runner.commandTimes.set(this.id, this.track.time);
        if (!runner.isGhost) {
            this.controlView();
        }
    }

    /** Applies a view command for the player. */
    private controlView(): void {
        const { kind, zoom, target, duration } = this.settings;
        if (kind === 'zoom') {
            this.track.zoomTarget = zoom;
        } else if (kind === 'camera') {
            this.track.cameraHold = { pos: target.clone(), until: this.track.time + duration };
        }
    }

    /**
     * Offset of the objects of the area for a runner, depending on whether and when it triggered
     * the block, null while they are hidden for it.
     */
    public offsetFor(runner: BikeRunner): Vector | null {
        const { kind, offset, duration } = this.settings;
        const triggeredAt = runner.commandTimes.get(this.id);

        switch (kind) {
            case 'hide':
                return triggeredAt === undefined ? NO_OFFSET : null;
            case 'show':
                return triggeredAt === undefined ? null : NO_OFFSET;
            case 'move': {
                if (triggeredAt === undefined) {
                    return NO_OFFSET;
                }
                const progress = Math.min(
                    1,
                    (this.track.time - triggeredAt) / Math.max(1, duration),
                );
                return progress >= 1 ? offset : offset.scale(progress);
            }
            default:
                return NO_OFFSET;
        }
    }

    protected override onAdd(): void {
        super.onAdd();
        this.track.commands.addBlock(this);
    }

    protected override onDelete(): void {
        super.onDelete();
        this.track.commands.removeBlock(this);
    }

    /** Draws a dark block, and in the editor what it acts on (see `Track.editing`). */
    public override render(ctx: CanvasRenderingContext2D): void {
        const pos = this.track.toPixel(this.pos);
        const zoom = this.track.zoomFactor;
        const size = 8 * zoom;

        ctx.save();
        ctx.fillStyle = this.itemClass.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(2 * zoom, 0.5);
        ctx.fillRect(pos.x - size, pos.y - size, 2 * size, 2 * size);
        ctx.strokeRect(pos.x - size, pos.y - size, 2 * size, 2 * size);
        // A play sign, the block running a command
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(pos.x - size / 3, pos.y - size / 2);
        ctx.lineTo(pos.x + size / 2, pos.y);
        ctx.lineTo(pos.x - size / 3, pos.y + size / 2);
        ctx.fill();
        ctx.restore();

        if (this.track.editing) {
            CommandBlock.renderSettings(ctx, this.track, this.pos, this.settings);
        }
    }

    /**
     * Draws what a command acts on: its area with its offset, or the point it shows, linked to
     * its block. Used by the blocks in the editor and by the preview of their tool.
     */
    public static renderSettings(
        ctx: CanvasRenderingContext2D,
        track: Track,
        blockPos: Vector,
        settings: CommandSettings,
    ): void {
        const { kind, area, offset, target } = settings;
        const zoom = track.zoomFactor;
        const block = track.toPixel(blockPos);

        ctx.save();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = Math.max(zoom, 0.5);
        ctx.setLineDash([4, 4]);

        const link = (point: Vector) => {
            ctx.beginPath();
            ctx.moveTo(block.x, block.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        };

        if (area) {
            const topLeft = track.toPixel(new Vector(area.left, area.top));
            const bottomRight = track.toPixel(new Vector(area.right, area.bottom));
            const [width, height] = [bottomRight.x - topLeft.x, bottomRight.y - topLeft.y];
            ctx.strokeRect(topLeft.x, topLeft.y, width, height);
            link(new Vector(topLeft.x + width / 2, topLeft.y + height / 2));

            if (kind === 'move') {
                const moved = topLeft.add(offset.scale(zoom));
                ctx.strokeStyle = '#59f';
                ctx.strokeRect(moved.x, moved.y, width, height);
                ctx.beginPath();
                ctx.moveTo(topLeft.x + width / 2, topLeft.y + height / 2);
                ctx.lineTo(moved.x + width / 2, moved.y + height / 2);
                ctx.stroke();
            }
        } else if (kind === 'camera') {
            const point = track.toPixel(target);
            link(point);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, 10 * zoom, 0, 2 * Math.PI);
            ctx.stroke();
        }
        ctx.restore();
    }

    public override toString(): string {
        this.recorded = true;
        const { kind, area, offset, target, duration, zoom } = this.settings;
        const values: number[] = [COMMAND_KINDS.indexOf(kind)];
        const areaValues = area ? [area.left, area.top, area.right, area.bottom] : [0, 0, 0, 0];

        if (kind === 'zoom') {
            values.push(zoom * 100);
        } else if (kind === 'camera') {
            values.push(target.x, target.y, duration);
        } else if (kind === 'move') {
            values.push(...areaValues, offset.x, offset.y, duration);
        } else {
            values.push(...areaValues);
        }

        const settings = values.map((value) => Math.round(value).toString(32)).join(' ');
        return `${this.itemClass.code} ${this.pos.toString()} ${settings}`;
    }

    /** Reads a command block from its track code, see {@link CommandBlock}. */
    public static override createInstance(itemCode: string[], track: Track): Item {
        const values = itemCode.slice(3).map((value) => parseInt(value, 32) || 0);
        const kind = COMMAND_KINDS[values[0]] ?? 'zoom';
        const settings = defaultCommandSettings(kind);
        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0] = values.slice(1);
        const area = { left: a, top: b, right: c, bottom: d };

        if (kind === 'zoom') {
            settings.zoom = a / 100 || 1;
        } else if (kind === 'camera') {
            settings.target = new Vector(a, b);
            settings.duration = c || settings.duration;
        } else {
            settings.area = area;
            if (kind === 'move') {
                settings.offset = new Vector(e, f);
                settings.duration = g || settings.duration;
            }
        }

        return new CommandBlock(parseItemPosition(itemCode), settings, track);
    }
}
