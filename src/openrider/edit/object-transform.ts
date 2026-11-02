import { Vector } from 'canvade';
import { DirectionalItem } from '../item/directional-item';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject } from '../item/track-object';
import { TrackEditor } from './track-editor';

/**
 * Move and free rotation of objects of a track, e.g. a selection dragged or turned, or objects
 * pasted: each point turns by an angle around a pivot, then moves by an offset.
 *
 * It gives the code of an object moved (see `ObjectData.code`), the points being rounded to whole
 * world units, as the track codes have them:
 * - a line moves both its ends;
 * - an item moves its position, a directional item also turning its direction by the angle;
 * - a command block only moves its position: the area it acts on, the point it shows and the
 *   offset it moves its area by stay as they are;
 * - a group of linked items, e.g. the two ends of a teleporter, only moves the items given, the
 *   others staying where they are.
 */
export class ObjectTransform {
    /** The transform keeping the objects as they are. */
    public static readonly NONE = new ObjectTransform(new Vector(), 0, new Vector());

    /**
     * @param pivot - Point the objects turn around, in world units.
     * @param angle - Angle, in radians, clockwise on the screen (the y axis going down).
     * @param offset - Move after turning, in world units.
     */
    public constructor(
        public readonly pivot: Vector,
        public readonly angle: number,
        public readonly offset: Vector,
    ) {}

    /** A move, without turning. */
    public static move(offset: Vector): ObjectTransform {
        return new ObjectTransform(new Vector(), 0, offset);
    }

    /** Whether the transform keeps the objects as they are. */
    public get isIdentity(): boolean {
        return this.offset.x === 0 && this.offset.y === 0 && this.turns === 0;
    }

    /** Angle in degrees, rounded as the directional items keep it, within a turn. */
    private get turns(): number {
        return ((Math.round((this.angle * 180) / Math.PI) % 360) + 360) % 360;
    }

    /** A point turned then moved, in world units, not rounded. */
    public point(point: Vector): Vector {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const x = point.x - this.pivot.x;
        const y = point.y - this.pivot.y;
        return new Vector(
            this.pivot.x + x * cos - y * sin + this.offset.x,
            this.pivot.y + x * sin + y * cos + this.offset.y,
        );
    }

    /**
     * Code of an object as it describes it in the edits (an editor unit, see
     * `TrackEditor.unitOf`), transformed.
     *
     * @param moved - Items of a group of linked items moving with it, the others staying; every
     * item moves when omitted.
     */
    public code(object: TrackObject, moved?: ReadonlySet<TrackObject>): string {
        const code = TrackEditor.codeOf(object).split(' ');
        if (object.kind !== 'item') {
            return `${this.point(object.pos)} ${this.point(object.endPos)}`;
        }

        if (object instanceof LinkedItemGroup) {
            // The letter, then the position of each item of the group
            const positions = object.instances.map((instance) =>
                !moved || moved.has(instance) ? this.point(instance.pos) : instance.pos,
            );
            return [code[0], ...positions.map((pos) => pos.toString())].join(' ');
        }

        const [letter, , , ...rest] = code;
        if (object instanceof DirectionalItem) {
            const rotation = (((object.rotation + this.turns) % 360) + 360) % 360;
            rest[0] = (rotation - 180).toString(32);
        }
        // The rest as it is: e.g. the settings of a command block, its area included
        return [letter, this.point(object.pos).toString(), ...rest].join(' ');
    }
}
