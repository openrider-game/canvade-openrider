import { Vector } from 'canvade';
import { ITEM_MAP } from '../item/item.constants';
import { SceneryLine } from '../item/line/scenery-line';
import { SolidLine } from '../item/line/solid-line';
import { LinkedItem } from '../item/linked-item';
import { LinkedItemGroup } from '../item/linked-item-group';
import type { TrackObject } from '../item/track-object';
import type { Track } from '../track/track';
import { TrackLayer, TrackLayerType } from '../track/track-layer';
import { LayerData, ObjectData, TrackEdit } from './track-edit';

/**
 * Edits the track: every change of its objects and layers made in the editor goes through it as
 * a {@link TrackEdit}, plain data, kept by the history to be undone (see `HistoryManager`).
 *
 * The objects and the layers have ids, the same on every screen editing the track: the objects of
 * a parsed track and its layers are numbered in their order (`p<n>`, `L<n>`), the new ones after
 * the prefix of the editor. The objects of an edit are created from their codes, as on the other
 * screens, rather than kept as drawn; the objects and layers taken off are kept, to be put back
 * as they were when undoing.
 */
export class TrackEditor {
    /** Prefix of the ids of the objects and layers created here. */
    public prefix = 'e';
    /**
     * Called with each edit made on this screen, undoing and redoing included: e.g. to send it to
     * the other screens editing the track, which apply it with {@link TrackEditor.apply}.
     */
    public onEdit: ((edit: TrackEdit) => void) | null = null;
    private counter = 0;
    /** Objects on the track by id: lines, items, groups of linked items. */
    private readonly objects = new Map<string, TrackObject>();
    /** Objects taken off the track by id, put back when added again. */
    private readonly detached = new Map<string, TrackObject>();
    /** Layers taken off the stack by id, put back when added again. */
    private readonly detachedLayers = new Map<string, TrackLayer>();

    public constructor(private readonly track: Track) {}

    /** The object an edit adds or removes for an object of the track: its group if linked. */
    public static unitOf(object: TrackObject): TrackObject {
        return object instanceof LinkedItem && object.group ? object.group : object;
    }

    /** A new id, unique on every screen editing the track. */
    public newUid(): string {
        return `${this.prefix}${this.counter++}`;
    }

    /** Object of the track with an id, if on the track. */
    public object(uid: string): TrackObject | undefined {
        return this.objects.get(uid);
    }

    /** Follows the objects added to the track, called by `Track.add`. */
    public added(object: TrackObject): void {
        const unit = TrackEditor.unitOf(object);
        if (unit.uid !== null) {
            this.objects.set(unit.uid, unit);
        }
    }

    /** Follows the objects removed from the track, called by `Track.remove`. */
    public removed(object: TrackObject): void {
        const unit = TrackEditor.unitOf(object);
        if (unit.uid !== null && this.objects.get(unit.uid) === unit) {
            this.objects.delete(unit.uid);
            this.detached.set(unit.uid, unit);
        }
    }

    /**
     * Adds objects drawn by a tool, placed on their layers, as an edit that can be undone. The
     * objects added are created from their codes: those given only describe them.
     *
     * @returns The objects added.
     */
    public add(objects: readonly TrackObject[]): TrackObject[] {
        const data = objects.map((object) => this.describe(object, this.newUid()));
        this.make({ type: 'add', objects: data });
        return data.flatMap(({ uid }) => this.objects.get(uid) ?? []);
    }

    /** Records objects a tool already took off the track, e.g. erased, as an edit. */
    public recordRemoved(objects: readonly TrackObject[]): void {
        const units = new Set(objects.map(TrackEditor.unitOf));
        const data = [...units].map((unit) => this.describe(unit, this.uidOf(unit)));
        const edit: TrackEdit = { type: 'remove', objects: data };
        this.onEdit?.(edit);
        this.track.history.push(edit);
    }

    /** Adds an empty layer at an index of the stack, as an edit that can be undone. */
    public addLayer(type: TrackLayerType, name: string, index: number): TrackLayer | undefined {
        const uid = this.newUid();
        this.make({ type: 'addLayer', layer: { uid, type, name }, index });
        return this.track.layers.byUid(uid);
    }

    /** Removes a layer with its objects, as an edit that can be undone. */
    public removeLayer(layer: TrackLayer): void {
        this.make({
            type: 'removeLayer',
            layer: TrackEditor.layerData(layer),
            index: this.track.layers.all.indexOf(layer),
            objects: this.objectsOf(layer),
        });
    }

    /** Moves a layer to an index of the stack, as an edit that can be undone. */
    public moveLayer(layer: TrackLayer, to: number): void {
        const from = this.track.layers.all.indexOf(layer);
        this.make({ type: 'moveLayer', layer: layer.uid, from, to });
    }

    /** Renames a layer, as an edit that can be undone. */
    public renameLayer(layer: TrackLayer, name: string): void {
        this.make({ type: 'renameLayer', layer: layer.uid, from: layer.name, to: name });
    }

    /** Applies an edit made on this screen, and keeps it in the history. */
    public make(edit: TrackEdit): void {
        this.replay(edit);
        this.track.history.push(edit);
    }

    /** Applies an edit made on this screen, without history: undoing or redoing one. */
    public replay(edit: TrackEdit): void {
        this.apply(edit);
        this.onEdit?.(edit);
    }

    /**
     * Applies an edit, without history nor telling it: e.g. made on another screen, see
     * {@link TrackEdit}.
     */
    public apply(edit: TrackEdit): void {
        const layers = this.track.layers;
        switch (edit.type) {
            case 'add':
                edit.objects.forEach((data) => this.create(data));
                break;
            case 'remove':
                edit.objects.forEach(({ uid }) => this.objects.get(uid)?.removeFromTrack());
                break;
            case 'addLayer':
                if (!layers.byUid(edit.layer.uid)) {
                    const layer =
                        this.detachedLayers.get(edit.layer.uid) ??
                        new TrackLayer(edit.layer.type, edit.layer.name);
                    layer.uid = edit.layer.uid;
                    layer.name = edit.layer.name;
                    layers.insert(layer, edit.index);
                }
                break;
            case 'removeLayer': {
                const layer = layers.byUid(edit.layer.uid);
                // The last main layer stays, as the stack needs one
                if (layer && (layer.type !== 'main' || layers.main.length > 1)) {
                    // Taken off the track, so that its items no longer count (targets...)
                    layer.objects().forEach((object) => object.removeFromTrack());
                    layers.detach(layer);
                    this.detachedLayers.set(layer.uid, layer);
                }
                break;
            }
            case 'moveLayer': {
                const layer = layers.byUid(edit.layer);
                if (layer) {
                    layers.moveTo(layer, edit.to);
                }
                break;
            }
            case 'renameLayer': {
                const layer = layers.byUid(edit.layer);
                if (layer) {
                    layer.name = edit.to;
                    this.track.invalidateUI();
                }
                break;
            }
            case 'group':
                edit.edits.forEach((part) => this.apply(part));
                break;
        }
    }

    /** Objects of a layer as edits describe them, each group of linked items once. */
    private objectsOf(layer: TrackLayer): ObjectData[] {
        const units = new Set(layer.objects().map(TrackEditor.unitOf));
        return [...units].map((unit) => this.describe(unit, this.uidOf(unit)));
    }

    /**
     * Id of an object of the track, given one if it has none yet, e.g. added to the track without
     * the editor: it is then followed as the others.
     */
    private uidOf(object: TrackObject): string {
        if (object.uid === null) {
            object.uid = this.newUid();
            if (object instanceof LinkedItemGroup ? object.instances[0]?.onTrack : object.onTrack) {
                this.objects.set(object.uid, object);
            }
        }
        return object.uid;
    }

    /** An object placed on a layer, as edits describe it. */
    private describe(object: TrackObject, uid: string): ObjectData {
        if (!object.layer) {
            throw new Error(`Track object #${object.id} is not placed on a layer`);
        }
        return { uid, layer: object.layer.uid, kind: object.kind, code: TrackEditor.code(object) };
    }

    /**
     * Code of an object: its points for a line, else its item code, without marking it as
     * exported (see `TrackObject.recorded`).
     */
    private static code(object: TrackObject): string {
        if (object.kind !== 'item') {
            return `${object.pos.toString()} ${object.endPos.toString()}`;
        }
        const marked = [object, ...(object instanceof LinkedItemGroup ? object.instances : [])];
        const recorded = marked.map((part) => part.recorded);
        const code = object.toString();
        marked.forEach((part, i) => (part.recorded = recorded[i]));
        return code;
    }

    /** Creates an object from its data and puts it on its layer, unless already there. */
    private create(data: ObjectData): void {
        const layer = this.track.layers.byUid(data.layer);
        if (!layer || this.objects.has(data.uid)) {
            return;
        }

        const code = data.code.split(' ');
        let object = this.detached.get(data.uid);
        if (object) {
            this.detached.delete(data.uid);
        } else if (data.kind === 'item') {
            object = ITEM_MAP.get(code[0])?.createInstance(code, this.track);
        } else {
            const [x1, y1, x2, y2] = code.map((value) => parseInt(value, 32));
            const LineClass = data.kind === 'solid' ? SolidLine : SceneryLine;
            object = new LineClass(new Vector(x1, y1), new Vector(x2, y2), this.track);
        }
        if (!object) {
            return;
        }

        object.uid = data.uid;
        object.layer = layer;
        object.addToTrack();
    }

    private static layerData(layer: TrackLayer): LayerData {
        return { uid: layer.uid, type: layer.type, name: layer.name };
    }
}
