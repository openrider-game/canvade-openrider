import { Vector } from 'canvade';
import { SCENERY_STROKE_STYLE, SOLID_STROKE_STYLE } from '../grid/cell/render-cell';
import { CommandBlock } from '../item/command/command-block';
import { Boost } from '../item/directional/boost';
import { Gravity } from '../item/directional/gravity';
import { Launcher } from '../item/directional/launcher';
import type { Item, ItemClass } from '../item/item';
import { LinkedCheckpoint } from '../item/linked/linked-checkpoint';
import { Teleporter } from '../item/linked/teleporter';
import { Bomb } from '../item/misc/bomb';
import { Mud } from '../item/misc/mud';
import { SlowMo } from '../item/misc/slow-mo';
import { Checkpoint } from '../item/reachable/checkpoint';
import { Target } from '../item/reachable/target';
import { EngineOff } from '../item/status/engine-off';
import { Heavy } from '../item/status/heavy';
import { Invincibility } from '../item/status/invincibility';
import { LowGravity } from '../item/status/low-gravity';
import { Mirror } from '../item/status/mirror';
import { NoSteer } from '../item/status/no-steer';
import { Reset } from '../item/status/reset';
import { Slippery } from '../item/status/slippery';
import { Turbo } from '../item/status/turbo';
import { ZeroGravity } from '../item/status/zero-gravity';
import type { Track } from '../track/track';
import type { DrawnIcon } from './tool';

/**
 * Icons of the item and line tools, drawn at the size they are displayed, so that they stay sharp
 * at any size (see `ToolIcons`). The other tools use svg icons from `media/icon`.
 */

/**
 * Half of the width of an item in its icon, as a part of the icon: 7 of its 24 pixels, the item
 * being 14 pixels wide in a 24 pixels icon.
 */
const ITEM_HALF_SIZE = 7 / 24,
    /** Half of the width of the circles and squares of the items, their border included. */
    ITEM_EXTENT = 8,
    /** Half of the length of the arrows of the directional items, their border included. */
    ARROW_EXTENT = 11,
    /** Half of the width of the command blocks, their border included. */
    BLOCK_EXTENT = 9;

/**
 * Icon of an item drawn by the item itself, centered in the icon and zoomed to fill it: the icon
 * looks like the item in the game.
 *
 * The item is not created: its render is called on an object of its class holding the fields the
 * render reads, on a track only placing it, so that drawing an icon has no side effect.
 *
 * @param extent - Half of the width of the item, its border included, in world units.
 * @param fields - Fields of the item read by its render, e.g. the rotation of a directional item.
 */
function itemIcon(
    itemClass: ItemClass,
    extent = ITEM_EXTENT,
    fields: Record<string, unknown> = {},
): DrawnIcon {
    return {
        type: 'drawn',
        key: `item:${itemClass.code}`,
        draw(ctx, size) {
            const center = new Vector(size / 2, size / 2);
            const track = {
                toPixel: () => center,
                zoomFactor: (size * ITEM_HALF_SIZE) / extent,
                editing: false,
            } as unknown as Track;
            const prototype = (itemClass as unknown as { prototype: Item }).prototype;
            const item = Object.assign(Object.create(prototype) as Item, {
                pos: center,
                track,
                reached: false,
                group: null,
                ...fields,
            });
            item.render(ctx);
        },
    };
}

/**
 * Icon of a drawing tool: a shape traced in a 24 pixels icon, stroked with the color of the lines
 * the tool draws, solid or scenery.
 *
 * @param trace - Traces the shape, with the size of a pixel of the 24 pixels icon.
 */
function strokeIcon(
    name: string,
    scenery: boolean,
    trace: (ctx: CanvasRenderingContext2D, unit: number) => void,
): DrawnIcon {
    return {
        type: 'drawn',
        key: `${name}:${scenery ? 'scenery' : 'solid'}`,
        draw(ctx, size) {
            const unit = size / 24;
            ctx.save();
            ctx.strokeStyle = scenery ? SCENERY_STROKE_STYLE : SOLID_STROKE_STYLE;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.lineWidth = 2.5 * unit;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            trace(ctx, unit);
            ctx.stroke();
            ctx.restore();
        },
    };
}

/** Icon of a line tool: a line across the icon. */
function lineIcon(scenery: boolean): DrawnIcon {
    return strokeIcon('line', scenery, (ctx, unit) => {
        ctx.moveTo(5 * unit, 19 * unit);
        ctx.lineTo(19 * unit, 5 * unit);
    });
}

/** Icon of a brush tool: a free hand stroke. */
function brushIcon(scenery: boolean): DrawnIcon {
    return strokeIcon('brush', scenery, (ctx, unit) => {
        ctx.moveTo(5 * unit, 16 * unit);
        ctx.bezierCurveTo(8 * unit, 6 * unit, 11 * unit, 6 * unit, 12 * unit, 12 * unit);
        ctx.bezierCurveTo(13 * unit, 18 * unit, 16 * unit, 18 * unit, 19 * unit, 8 * unit);
    });
}

/** Icon of the circle tool: a circle filling the icon. */
function circleIcon(scenery: boolean): DrawnIcon {
    return strokeIcon('circle', scenery, (ctx, unit) => {
        ctx.arc(12 * unit, 12 * unit, 9 * unit, 0, 2 * Math.PI);
    });
}

/** Icon of the curve tool: an arch between its two end points, drawn as dots. */
function curveIcon(scenery: boolean): DrawnIcon {
    return strokeIcon('curve', scenery, (ctx, unit) => {
        ctx.moveTo(4 * unit, 19 * unit);
        ctx.bezierCurveTo(6 * unit, 6 * unit, 18 * unit, 6 * unit, 20 * unit, 19 * unit);
        ctx.stroke();
        // The end points, filled with the color of the stroke
        for (const x of [4, 20]) {
            ctx.beginPath();
            ctx.arc(x * unit, 19 * unit, 2 * unit, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.beginPath();
    });
}

/** The directional items pointing right, as boosting forward, or down for the gravity. */
const RIGHT = { rotation: -90 },
    DOWN = { rotation: 0 };

export const TARGET_ICON = itemIcon(Target),
    CHECKPOINT_ICON = itemIcon(Checkpoint),
    BOMB_ICON = itemIcon(Bomb),
    SLOWMO_ICON = itemIcon(SlowMo),
    MUD_ICON = itemIcon(Mud),
    LINKED_CHECKPOINT_ICON = itemIcon(LinkedCheckpoint),
    TELEPORTER_ICON = itemIcon(Teleporter),
    BOOST_ICON = itemIcon(Boost, ARROW_EXTENT, RIGHT),
    LAUNCHER_ICON = itemIcon(Launcher, ARROW_EXTENT, RIGHT),
    GRAVITY_ICON = itemIcon(Gravity, ARROW_EXTENT, DOWN),
    RESET_ICON = itemIcon(Reset),
    ENGINE_OFF_ICON = itemIcon(EngineOff),
    SLIPPERY_ICON = itemIcon(Slippery),
    INVINCIBILITY_ICON = itemIcon(Invincibility),
    ZERO_GRAVITY_ICON = itemIcon(ZeroGravity),
    NOSTEER_ICON = itemIcon(NoSteer),
    HEAVY_ICON = itemIcon(Heavy),
    LOW_GRAVITY_ICON = itemIcon(LowGravity),
    MIRROR_ICON = itemIcon(Mirror),
    TURBO_ICON = itemIcon(Turbo),
    COMMAND_BLOCK_ICON = itemIcon(CommandBlock, BLOCK_EXTENT),
    SOLID_LINE_ICON = lineIcon(false),
    SCENERY_LINE_ICON = lineIcon(true),
    SOLID_BRUSH_ICON = brushIcon(false),
    SCENERY_BRUSH_ICON = brushIcon(true),
    SOLID_CIRCLE_ICON = circleIcon(false),
    SCENERY_CIRCLE_ICON = circleIcon(true),
    SOLID_CURVE_ICON = curveIcon(false),
    SCENERY_CURVE_ICON = curveIcon(true);
